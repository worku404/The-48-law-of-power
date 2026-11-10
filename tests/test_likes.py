import pytest
import sqlite3
from app.services.likes import LikesService

def test_initial_likes_is_zero(app):
    with app.app_context():
        service = app.likes_service
        assert service.get_likes(1) == 0

def test_add_like_success(app):
    with app.app_context():
        app.user_service.create_user("user1", "pass1")
        service = app.likes_service
        user = "user1"
        
        # Like first time
        likes, success = service.add_like(user, 1)
        assert success is True
        assert likes == 1
        assert service.get_likes(1) == 1
        assert service.has_liked(user, 1) is True

def test_prevent_double_like(app):
    with app.app_context():
        app.user_service.create_user("user1", "pass1")
        service = app.likes_service
        user = "user1"
        
        # First like
        service.add_like(user, 1)
        # Second like attempt from same user
        likes, success = service.add_like(user, 1)
        
        assert success is False
        assert likes == 1
        assert service.get_likes(1) == 1

def test_multiple_users_increment(app):
    with app.app_context():
        app.user_service.create_user("user-A", "pass")
        app.user_service.create_user("user-B", "pass")
        app.user_service.create_user("user-C", "pass")
        service = app.likes_service
        
        service.add_like("user-A", 1)
        service.add_like("user-B", 1)
        likes, success = service.add_like("user-C", 1)
        
        assert success is True
        assert likes == 3
        assert service.get_likes(1) == 3

def test_persistence_on_database_restart(app):
    # Retrieve DB file path
    db_path = app.config['DATABASE_PATH']
    user = "persisting-user"
    
    # Write a like
    with app.app_context():
        app.user_service.create_user(user, "pass")
        service = app.likes_service
        service.add_like(user, 5)
        assert service.get_likes(5) == 1
        
    # Reinitialize a new service pointing to the same file (simulates app restart)
    new_service = LikesService(db_path=db_path)
    with app.app_context():
        # Read from the file
        assert new_service.get_likes(5) == 1
        assert new_service.has_liked(user, 5) is True

def test_remove_like(app):
    with app.app_context():
        app.user_service.create_user("user-rem", "pass")
        service = app.likes_service
        service.add_like("user-rem", 1)
        assert service.get_likes(1) == 1
        assert service.has_liked("user-rem", 1) is True

        # Remove like
        likes, success = service.remove_like("user-rem", 1)
        assert success is True
        assert likes == 0
        assert service.get_likes(1) == 0
        assert service.has_liked("user-rem", 1) is False

def test_toggle_like(app):
    with app.app_context():
        app.user_service.create_user("user-tog", "pass")
        service = app.likes_service

        # First toggle: adds like
        likes, is_liked = service.toggle_like("user-tog", 1)
        assert is_liked is True
        assert likes == 1
        assert service.has_liked("user-tog", 1) is True

        # Second toggle: removes like (undo)
        likes, is_liked = service.toggle_like("user-tog", 1)
        assert is_liked is False
        assert likes == 0
        assert service.has_liked("user-tog", 1) is False
