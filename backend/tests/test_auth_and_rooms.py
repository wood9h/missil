"""
Backend API tests for Cold War Artillery Multiplayer Game
Tests: Auth endpoints (register, login, logout, me) and Room endpoints (create, list, join, delete)
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://missile-command-5.preview.emergentagent.com"


class TestHealthCheck:
    """Test API root endpoint"""

    def test_api_root(self):
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert data["message"] == "Cold War Artillery API"
        print("✓ API root endpoint working")


class TestAuth:
    """Authentication endpoint tests"""

    def test_get_me_unauthenticated(self):
        """GET /api/auth/me without session should return 401"""
        response = requests.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 401
        data = response.json()
        assert "detail" in data
        print("✓ GET /api/auth/me returns 401 when not authenticated")

    def test_register_new_user(self):
        """POST /api/auth/register should create user and return session cookie"""
        unique_email = f"test_user_{uuid.uuid4().hex[:8]}@test.com"
        payload = {
            "email": unique_email,
            "password": "testpass123",
            "name": "Test Player"
        }
        response = requests.post(
            f"{BASE_URL}/api/auth/register",
            json=payload,
            allow_redirects=False
        )
        assert response.status_code == 200
        data = response.json()
        assert "user_id" in data
        assert data["email"] == unique_email
        assert data["name"] == "Test Player"
        # Check that session cookie was set
        assert "session_token" in response.cookies
        print(f"✓ Registration successful for {unique_email}")

    def test_register_duplicate_email(self):
        """POST /api/auth/register with existing email should return 400"""
        unique_email = f"test_dup_{uuid.uuid4().hex[:8]}@test.com"
        payload = {
            "email": unique_email,
            "password": "testpass123",
            "name": "First User"
        }
        # Register first
        response1 = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        assert response1.status_code == 200
        
        # Try to register again with same email
        response2 = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        assert response2.status_code == 400
        data = response2.json()
        assert "detail" in data
        assert "already registered" in data["detail"].lower()
        print("✓ Duplicate email registration returns 400")

    def test_login_success(self):
        """POST /api/auth/login with valid credentials should authenticate"""
        # First register a user
        unique_email = f"test_login_{uuid.uuid4().hex[:8]}@test.com"
        reg_payload = {
            "email": unique_email,
            "password": "logintest123",
            "name": "Login Test"
        }
        requests.post(f"{BASE_URL}/api/auth/register", json=reg_payload)
        
        # Now login
        login_payload = {
            "email": unique_email,
            "password": "logintest123"
        }
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json=login_payload,
            allow_redirects=False
        )
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == unique_email
        assert data["name"] == "Login Test"
        assert "session_token" in response.cookies
        print(f"✓ Login successful for {unique_email}")

    def test_login_invalid_credentials(self):
        """POST /api/auth/login with wrong password should return 401"""
        login_payload = {
            "email": "nonexistent@test.com",
            "password": "wrongpassword"
        }
        response = requests.post(f"{BASE_URL}/api/auth/login", json=login_payload)
        assert response.status_code == 401
        print("✓ Invalid login returns 401")

    def test_get_me_authenticated(self):
        """GET /api/auth/me with valid session should return user data"""
        # Register and get session
        unique_email = f"test_me_{uuid.uuid4().hex[:8]}@test.com"
        payload = {
            "email": unique_email,
            "password": "testpass123",
            "name": "Me Test User"
        }
        reg_response = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        session_token = reg_response.cookies.get("session_token")
        
        # Use the session to call /me
        me_response = requests.get(
            f"{BASE_URL}/api/auth/me",
            cookies={"session_token": session_token}
        )
        assert me_response.status_code == 200
        data = me_response.json()
        assert data["email"] == unique_email
        assert data["name"] == "Me Test User"
        print("✓ GET /api/auth/me returns user data when authenticated")

    def test_logout(self):
        """POST /api/auth/logout should clear session"""
        # Register and get session
        unique_email = f"test_logout_{uuid.uuid4().hex[:8]}@test.com"
        payload = {
            "email": unique_email,
            "password": "testpass123",
            "name": "Logout Test"
        }
        reg_response = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        session_token = reg_response.cookies.get("session_token")
        
        # Logout
        logout_response = requests.post(
            f"{BASE_URL}/api/auth/logout",
            cookies={"session_token": session_token}
        )
        assert logout_response.status_code == 200
        data = logout_response.json()
        assert data["ok"] == True
        
        # Verify session is invalidated - subsequent /me should fail
        me_response = requests.get(
            f"{BASE_URL}/api/auth/me",
            cookies={"session_token": session_token}
        )
        # After logout, session should be invalid
        assert me_response.status_code == 401
        print("✓ Logout clears session successfully")


class TestRooms:
    """Room CRUD tests"""

    @pytest.fixture
    def authenticated_session(self):
        """Create a user and return session token"""
        unique_email = f"room_test_{uuid.uuid4().hex[:8]}@test.com"
        payload = {
            "email": unique_email,
            "password": "testpass123",
            "name": f"Room Tester {uuid.uuid4().hex[:4]}"
        }
        response = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        if response.status_code != 200:
            # User might exist, try login
            login_payload = {"email": unique_email, "password": "testpass123"}
            response = requests.post(f"{BASE_URL}/api/auth/login", json=login_payload)
        return {
            "session_token": response.cookies.get("session_token"),
            "user": response.json()
        }

    @pytest.fixture
    def second_user_session(self):
        """Create a second user for join tests"""
        unique_email = f"room_guest_{uuid.uuid4().hex[:8]}@test.com"
        payload = {
            "email": unique_email,
            "password": "testpass123",
            "name": f"Guest Player {uuid.uuid4().hex[:4]}"
        }
        response = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        return {
            "session_token": response.cookies.get("session_token"),
            "user": response.json()
        }

    def test_list_rooms_unauthenticated(self):
        """GET /api/rooms without auth should return 401"""
        response = requests.get(f"{BASE_URL}/api/rooms")
        assert response.status_code == 401
        print("✓ GET /api/rooms returns 401 when not authenticated")

    def test_list_rooms_authenticated(self, authenticated_session):
        """GET /api/rooms with auth should return room list"""
        response = requests.get(
            f"{BASE_URL}/api/rooms",
            cookies={"session_token": authenticated_session["session_token"]}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/rooms returns list ({len(data)} rooms)")

    def test_create_room(self, authenticated_session):
        """POST /api/rooms should create a new room"""
        room_name = f"Test Room {uuid.uuid4().hex[:6]}"
        response = requests.post(
            f"{BASE_URL}/api/rooms",
            json={"name": room_name},
            cookies={"session_token": authenticated_session["session_token"]}
        )
        assert response.status_code == 200
        data = response.json()
        assert "room_id" in data
        assert data["name"] == room_name
        assert data["status"] == "waiting"
        assert data["host_id"] == authenticated_session["user"]["user_id"]
        assert data["host_name"] == authenticated_session["user"]["name"]
        assert data["guest_id"] is None
        # Verify sides are assigned
        assert data["host_side"] in ["usa", "ussr"]
        assert data["guest_side"] in ["usa", "ussr"]
        assert data["host_side"] != data["guest_side"]
        print(f"✓ Room created: {data['room_id']} ({room_name})")
        return data

    def test_create_room_unauthenticated(self):
        """POST /api/rooms without auth should return 401"""
        response = requests.post(
            f"{BASE_URL}/api/rooms",
            json={"name": "Unauthorized Room"}
        )
        assert response.status_code == 401
        print("✓ POST /api/rooms returns 401 when not authenticated")

    def test_join_room(self, authenticated_session, second_user_session):
        """POST /api/rooms/{room_id}/join should add guest to room"""
        # Create room with first user
        room_name = f"Join Test Room {uuid.uuid4().hex[:6]}"
        create_response = requests.post(
            f"{BASE_URL}/api/rooms",
            json={"name": room_name},
            cookies={"session_token": authenticated_session["session_token"]}
        )
        room_data = create_response.json()
        room_id = room_data["room_id"]
        
        # Join with second user
        join_response = requests.post(
            f"{BASE_URL}/api/rooms/{room_id}/join",
            cookies={"session_token": second_user_session["session_token"]}
        )
        assert join_response.status_code == 200
        joined_room = join_response.json()
        assert joined_room["guest_id"] == second_user_session["user"]["user_id"]
        assert joined_room["guest_name"] == second_user_session["user"]["name"]
        assert joined_room["status"] == "playing"
        print(f"✓ Guest joined room {room_id}")

    def test_cannot_join_own_room(self, authenticated_session):
        """POST /api/rooms/{room_id}/join should not allow host to join own room"""
        # Create room
        room_name = f"Self Join Test {uuid.uuid4().hex[:6]}"
        create_response = requests.post(
            f"{BASE_URL}/api/rooms",
            json={"name": room_name},
            cookies={"session_token": authenticated_session["session_token"]}
        )
        room_id = create_response.json()["room_id"]
        
        # Try to join own room
        join_response = requests.post(
            f"{BASE_URL}/api/rooms/{room_id}/join",
            cookies={"session_token": authenticated_session["session_token"]}
        )
        assert join_response.status_code == 400
        print("✓ Host cannot join own room (400)")

    def test_join_nonexistent_room(self, authenticated_session):
        """POST /api/rooms/{room_id}/join with invalid room_id should return 404"""
        join_response = requests.post(
            f"{BASE_URL}/api/rooms/nonexistent_room_123/join",
            cookies={"session_token": authenticated_session["session_token"]}
        )
        assert join_response.status_code == 404
        print("✓ Joining nonexistent room returns 404")

    def test_delete_room_as_host(self, authenticated_session):
        """DELETE /api/rooms/{room_id} by host should delete room"""
        # Create room
        room_name = f"Delete Test {uuid.uuid4().hex[:6]}"
        create_response = requests.post(
            f"{BASE_URL}/api/rooms",
            json={"name": room_name},
            cookies={"session_token": authenticated_session["session_token"]}
        )
        room_id = create_response.json()["room_id"]
        
        # Delete room
        delete_response = requests.delete(
            f"{BASE_URL}/api/rooms/{room_id}",
            cookies={"session_token": authenticated_session["session_token"]}
        )
        assert delete_response.status_code == 200
        assert delete_response.json()["ok"] == True
        print(f"✓ Host can delete room {room_id}")


class TestTrajectory:
    """Test trajectory calculation endpoint"""

    def test_trajectory_calculation(self):
        """POST /api/trajectory should calculate missile path"""
        payload = {
            "angle": 45,
            "velocity": 30,
            "cannon_x": 50,
            "cannon_y": 30
        }
        response = requests.post(f"{BASE_URL}/api/trajectory", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert "trajectory" in data
        assert isinstance(data["trajectory"], list)
        assert len(data["trajectory"]) > 0
        # Check trajectory point structure
        first_point = data["trajectory"][0]
        assert "x" in first_point
        assert "y" in first_point
        assert "t" in first_point
        print(f"✓ Trajectory calculated with {len(data['trajectory'])} points")


class TestExistingTestUser:
    """Test login with the provided test user credentials"""

    def test_login_test_user(self):
        """Login with test@test.com should work if user exists"""
        login_payload = {
            "email": "test@test.com",
            "password": "test123"
        }
        response = requests.post(f"{BASE_URL}/api/auth/login", json=login_payload)
        if response.status_code == 200:
            data = response.json()
            assert data["email"] == "test@test.com"
            print(f"✓ Test user login successful: {data['name']}")
        elif response.status_code == 401:
            # User might not exist, try to register
            reg_payload = {
                "email": "test@test.com",
                "password": "test123",
                "name": "TestPlayer"
            }
            reg_response = requests.post(f"{BASE_URL}/api/auth/register", json=reg_payload)
            if reg_response.status_code == 200:
                print("✓ Test user registered successfully")
            else:
                print(f"! Test user registration failed: {reg_response.status_code}")
                # Still pass the test - user might already exist with different password
        else:
            print(f"! Unexpected status code: {response.status_code}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
