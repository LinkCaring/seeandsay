"""
MongoDB Storage Manager for See&Say Application
"""

from pymongo.mongo_client import MongoClient

from pymongo.server_api import ServerApi
import pymongo.errors
from pymongo.errors import ConnectionFailure, DuplicateKeyError
import certifi
import os
from dotenv import load_dotenv
import logging
from datetime import datetime, timezone
import re


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()
mongodb_url = os.environ.get("MONGODB_URL")
database_name = os.environ.get("DATABASE_NAME")


class SeeSayMongoStorage:
    """Shared MongoDB storage for user data"""

    def __init__(self, mongodb_url=None, database_name=None):
        self.mongodb_url = mongodb_url or os.environ.get("MONGODB_URL")
        self.database_name = database_name or os.environ.get("DATABASE_NAME")
        self.client = None ## MongoDB whole Information
        self.db = None  ## MongoDB specific Database
        self.users_collection = None   ## =self.db.{collecntion_name}
        self.connect()

    ## connect sets all the mongoDB info, creating the self variables.
    def connect(self):
        """Connect to MongoDB"""
        try:
            if not self.mongodb_url:
                raise ValueError("MongoDB URI not provided")

            # Use certifi for SSL certificate verification
            self.client = MongoClient(
                self.mongodb_url,
                tlsCAFile=certifi.where(),
                serverSelectionTimeoutMS=10000,
                maxPoolSize=50,
                retryWrites=True
            )

            # Test the connection
            self.client.admin.command('ping')

            self.db = self.client[self.database_name]
            self.users_collection = self.db.users

            # Create indexes for better performance
            self.users_collection.create_index("userId", unique=True)


            logger.info(f"✅ Connected to MongoDB: {self.database_name}")

        except ConnectionFailure as e:
            logger.error(f"❌ Failed to connect to MongoDB: {e}")
            raise
        except Exception as e:
            logger.error(f"❌ MongoDB connection error: {e}")
            raise
    @staticmethod
    def normalize_parent_phone(phone):
        """Normalize Israeli mobile for SMS; returns None if empty/invalid."""
        if phone is None:
            return None
        raw = str(phone).strip()
        if not raw:
            return None
        digits = re.sub(r"\D", "", raw)
        if digits.startswith("972"):
            digits = digits[3:]
        if digits.startswith("0"):
            digits = digits[1:]
        if len(digits) == 9 and digits[0] in ("5", "7"):
            return "0" + digits
        if len(digits) == 10 and digits[0] == "0" and digits[1] in ("5", "7"):
            return digits
        return None

    def add_user(self, user_id, user_name, parent_phone=None):
        """Add a new user to MongoDB if userId does not already exist"""
        logger.info(f"Adding new user....: {user_id} ({user_name})")
        try:
            user_data = {
                'userId': user_id,
                'userName': user_name,
                'createdAt': datetime.now(),
                'last_update': datetime.now(),
                'tests': [],
                'active': True,
            }
            normalized_phone = self.normalize_parent_phone(parent_phone)
            if normalized_phone:
                user_data['parentPhone'] = normalized_phone
                user_data['parentPhoneUpdatedAt'] = datetime.now()

            result = self.users_collection.insert_one(user_data)
            logger.info(f"✅ Added new user: {user_id} ({user_name})")
            return True

        except pymongo.errors.DuplicateKeyError:
            logger.warning(f"⚠️ User ID {user_id} already exists. No action taken.")
            return False

        except Exception as e:
            logger.error(f"❌ Error adding user {user_id} ({user_name}): {e}")
            return False

    def set_user_parent_phone(self, user_id, phone):
        """Set or clear optional parent SMS phone on user document."""
        normalized = self.normalize_parent_phone(phone)
        try:
            update_fields = {"last_update": datetime.now(), "parentPhoneUpdatedAt": datetime.now()}
            if normalized:
                update_fields["parentPhone"] = normalized
            else:
                update_fields["parentPhone"] = None
            result = self.users_collection.update_one(
                {"userId": user_id},
                {"$set": update_fields},
            )
            if result.matched_count == 0:
                logger.warning(f"⚠️ User ID {user_id} not found for parentPhone update.")
                return False
            return True
        except Exception as e:
            logger.error(f"❌ Error setting parentPhone for user {user_id}: {e}")
            return False

    def get_user_parent_phone(self, user_id):
        try:
            doc = self.users_collection.find_one(
                {"userId": user_id},
                {"_id": 0, "parentPhone": 1},
            )
            if not doc:
                return None
            return doc.get("parentPhone") or None
        except Exception as e:
            logger.error(f"❌ Error getting parentPhone for user {user_id}: {e}")
            return None


    def get_user_test_by_id(self, user_id, test_id):
        """Return a single test subdocument by testId, or None."""
        try:
            test_id_str = str(test_id)
            pipeline = [
                {"$match": {"userId": user_id}},
                {"$unwind": "$tests"},
                {"$match": {"tests.testId": test_id_str}},
                {"$replaceRoot": {"newRoot": "$tests"}},
                {"$limit": 1},
            ]
            rows = list(self.users_collection.aggregate(pipeline))
            return rows[0] if rows else None
        except Exception as e:
            logger.error(f"❌ Error getting test {test_id} for user {user_id}: {e}")
            return None

    def get_latest_user_test(self, user_id):
        """Latest test by dateFinished for userId (recovery)."""
        try:
            pipeline = [
                {"$match": {"userId": user_id}},
                {"$unwind": "$tests"},
                {"$sort": {"tests.dateFinished": -1}},
                {"$limit": 1},
                {"$replaceRoot": {"newRoot": "$tests"}},
            ]
            rows = list(self.users_collection.aggregate(pipeline))
            return rows[0] if rows else None
        except Exception as e:
            logger.error(f"❌ Error getting latest test for user {user_id}: {e}")
            return None

    def add_test_to_user(self,
                         user_id,age_years,age_months,
                         full_array,correct, partly, wrong,
                         audio_file_base64,updated_transcription, timestamps,
                         expression_ai=None, test_id=None,
                         audio_blob_path=None, client_info=None,
                         results_access=None):
        """
        Adds a new exam record to the 'tests' array of a specific user.
        Time_took --> how long it took to finish
        """
        try:
            ## Data storage - audio as base64 (legacy) or Azure blob pointer
            new_test = {
                'testId': test_id,
                'dateFinished': datetime.now(),
                'ageYears': age_years,
                'ageMonths': age_months,
                'fullArray': full_array,
                'correct': correct,
                'partly': partly,
                'wrong': wrong,
                'transcription': updated_transcription,
                'timestamps': timestamps,
                'expressionAI': expression_ai or {}
            }
            if audio_blob_path:
                new_test['audioBlobPath'] = audio_blob_path
                new_test['audioFile64'] = None
            else:
                new_test['audioFile64'] = audio_file_base64
                new_test['audioBlobPath'] = None

            if client_info and isinstance(client_info, dict):
                new_test['clientInfo'] = client_info

            if results_access and isinstance(results_access, dict):
                new_test['resultsAccess'] = results_access

            ## Save
            result = self.users_collection.update_one(
                {'userId': user_id},
                {'$push': {'tests': new_test}}
            )

            if result.matched_count == 0:
                # User was not found in the database
                logger.warning(f"⚠️ User ID {user_id} not found. Cannot add test.")
                return False
            elif result.modified_count == 1:
                # Successfully pushed the new test
                logger.info(f"✅ Successfully added new test for user ID: {user_id}")
                return True
            else:
                # Matched but not modified (shouldn't happen with $push unless user document is locked)
                logger.warning(f"⚠️ Test addition for user {user_id} resulted in no change.")
                return False

        except Exception as e:
            logger.error(f"❌ Error adding test for user {user_id}: {e}")
            return False

    def update_test_expression_ai(self, user_id, test_id, expression_ai):
        """
        Update expressionAI payload for a specific stored test by testId.
        """
        try:
            result = self.users_collection.update_one(
                {"userId": user_id, "tests.testId": test_id},
                {"$set": {"tests.$.expressionAI": expression_ai}}
            )
            if result.matched_count == 0:
                logger.warning(f"⚠️ No matching test for user {user_id} testId {test_id}")
                return False
            return True
        except Exception as e:
            logger.error(f"❌ Error updating expressionAI for user {user_id}, testId {test_id}: {e}")
            return False

    def find_test_by_results_token(self, token):
        """Return {userId, test} for matching resultsAccess.token, or None."""
        try:
            token_str = str(token).strip()
            if not token_str:
                return None
            pipeline = [
                {"$unwind": "$tests"},
                {"$match": {"tests.resultsAccess.token": token_str}},
                {
                    "$project": {
                        "_id": 0,
                        "userId": 1,
                        "test": "$tests",
                    }
                },
                {"$limit": 1},
            ]
            rows = list(self.users_collection.aggregate(pipeline))
            if not rows:
                return None
            return {"userId": rows[0].get("userId"), "test": rows[0].get("test")}
        except Exception as e:
            logger.error(f"❌ Error finding test by results token: {e}")
            return None

    def mark_results_sms_sent(self, user_id, test_id):
        """Idempotent: set smsSentAt only if not already set."""
        try:
            now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
            result = self.users_collection.update_one(
                {
                    "userId": user_id,
                    "tests.testId": str(test_id),
                    "tests.resultsAccess.smsSentAt": None,
                },
                {"$set": {"tests.$.resultsAccess.smsSentAt": now}},
            )
            return result.modified_count == 1
        except Exception as e:
            logger.error(f"❌ Error marking SMS sent for user {user_id} test {test_id}: {e}")
            return False

    def set_test_sms_last_error(self, user_id, test_id, error_message):
        try:
            self.users_collection.update_one(
                {"userId": user_id, "tests.testId": str(test_id)},
                {"$set": {"tests.$.resultsAccess.smsLastError": str(error_message)[:500]}},
            )
        except Exception as e:
            logger.error(f"❌ Error setting smsLastError: {e}")

    def get_test_expression_ai(self, user_id, test_id):
        """
        Get expressionAI payload for a specific test by testId.
        Uses aggregation so large audioFile64 fields are not loaded over the wire.
        """
        try:
            test_id_str = str(test_id)
            pipeline = [
                {"$match": {"userId": user_id}},
                {"$unwind": "$tests"},
                {"$match": {"tests.testId": test_id_str}},
                {
                    "$project": {
                        "_id": 0,
                        "expressionAI": "$tests.expressionAI",
                    }
                },
                {"$limit": 1},
            ]
            rows = list(self.users_collection.aggregate(pipeline))
            if not rows:
                return None
            payload = rows[0].get("expressionAI")
            if payload is None:
                return {}
            return payload
        except Exception as e:
            logger.error(f"❌ Error getting expressionAI for user {user_id}, testId {test_id}: {e}")
            return None

    def close_connection(self):
        """Close MongoDB connection"""
        if self.client:
            self.client.close()
            logger.info("✅ MongoDB connection closed")

    def check_and_increment_daily_quota(self, quota_key: str, date_key: str, daily_limit: int) -> bool:
        """
        Atomic daily quota limiter using MongoDB.
        Returns True when call is allowed and counter incremented.
        Returns False when daily limit is already reached.
        """
        try:
            col = self.db.api_usage
            doc_id = f"{quota_key}:{date_key}"

            # Ensure doc exists
            col.update_one(
                {"_id": doc_id},
                {
                    "$setOnInsert": {
                        "_id": doc_id,
                        "quota_key": quota_key,
                        "date_key": date_key,
                        "count": 0,
                        "updatedAt": datetime.now(),
                    }
                },
                upsert=True,
            )

            # Increment only when still below limit
            result = col.update_one(
                {"_id": doc_id, "count": {"$lt": int(daily_limit)}},
                {"$inc": {"count": 1}, "$set": {"updatedAt": datetime.now()}},
            )
            return result.modified_count == 1
        except Exception as e:
            logger.error(f"❌ Error in daily quota check/increment: {e}")
            # Fail-open to avoid blocking critical test completion due to quota subsystem failure
            return True

    def __enter__(self):
        """Context manager entry"""
        return self

    # def __exit__(self, exc_type, exc_val, exc_tb):
    #     """Context manager exit"""
    #     self.close_connection()


if __name__ == '__main__':
    # Initialize storage manager
    try:
        storage_manager = SeeSayMongoStorage()
    except Exception as e:
        logger.error(f"❌ Failed to initialize MongoDB storage: {e}")


    # storage_manager.add_user(user_id= "123123",user_name= "TomTESTTTT",age= 1)
    # storage_manager.add_test_to_user(user_id= "123123",time_took=2,errors=10000,audio_file=None,final_evaluation="Great!")
    # # fdgss
