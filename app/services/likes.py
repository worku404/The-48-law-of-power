class LikesService:
    def __init__(self, db_service=None, db_path=None):
        if db_service is None:
            from app.services.db import DatabaseService
            db_service = DatabaseService(db_path=db_path)
        self.db_service = db_service

    def get_likes(self, section_id):
        cursor = self.db_service.execute(
            "SELECT like_count FROM section_likes WHERE section_id = ?",
            (section_id,)
        )
        row = cursor.fetchone()
        cursor.close()
        return row['like_count'] if row else 0

    def has_liked(self, username, section_id):
        if not username:
            return False
        cursor = self.db_service.execute(
            "SELECT 1 FROM user_likes WHERE username = ? AND section_id = ?",
            (username.strip(), section_id)
        )
        row = cursor.fetchone()
        cursor.close()
        return row is not None

    def add_like(self, username, section_id):
        if not username:
            return self.get_likes(section_id), False

        username = username.strip()
        try:
            # Insert the user like once. The unique primary key (username, section_id)
            # prevents duplicate likes across browsers/devices.
            if self.db_service.is_postgres():
                cursor_vis = self.db_service.execute("""
                    INSERT INTO user_likes (username, section_id)
                    VALUES (?, ?)
                    ON CONFLICT(username, section_id) DO NOTHING
                """, (username, section_id))
            else:
                cursor_vis = self.db_service.execute("""
                    INSERT INTO user_likes (username, section_id)
                    VALUES (?, ?)
                    ON CONFLICT(username, section_id) DO NOTHING
                """, (username, section_id))
            inserted = cursor_vis.rowcount == 1
            cursor_vis.close()

            if not inserted:
                self.db_service.rollback()
                return self.get_likes(section_id), False

            if self.db_service.is_postgres():
                cursor_like = self.db_service.execute("""
                    INSERT INTO section_likes (section_id, like_count)
                    VALUES (?, 1)
                    ON CONFLICT(section_id) DO UPDATE SET like_count = section_likes.like_count + 1
                """, (section_id,))
            else:
                cursor_like = self.db_service.execute("""
                    INSERT INTO section_likes (section_id, like_count)
                    VALUES (?, 1)
                    ON CONFLICT(section_id) DO UPDATE SET like_count = like_count + 1
                """, (section_id,))
            cursor_like.close()
            
            self.db_service.commit()
            return self.get_likes(section_id), True
        except Exception:
            self.db_service.rollback()
            return self.get_likes(section_id), False

    def remove_like(self, username, section_id):
        if not username:
            return self.get_likes(section_id), False

        username = username.strip()
        try:
            cursor_del = self.db_service.execute("""
                DELETE FROM user_likes WHERE username = ? AND section_id = ?
            """, (username, section_id))
            deleted = cursor_del.rowcount > 0
            cursor_del.close()

            if not deleted:
                self.db_service.rollback()
                return self.get_likes(section_id), False

            cursor_like = self.db_service.execute("""
                UPDATE section_likes
                SET like_count = CASE WHEN like_count > 0 THEN like_count - 1 ELSE 0 END
                WHERE section_id = ?
            """, (section_id,))
            cursor_like.close()

            self.db_service.commit()
            return self.get_likes(section_id), True
        except Exception:
            self.db_service.rollback()
            return self.get_likes(section_id), False

    def toggle_like(self, username, section_id):
        """
        Toggles like for a user on a given section.
        If user has already liked, it removes the like (unlike/undo).
        If user has not liked, it adds the like.
        Returns tuple: (current_like_count, is_liked)
        """
        if not username:
            return self.get_likes(section_id), False

        username = username.strip()
        if self.has_liked(username, section_id):
            likes_count, _ = self.remove_like(username, section_id)
            return likes_count, False
        else:
            likes_count, _ = self.add_like(username, section_id)
            return likes_count, True
