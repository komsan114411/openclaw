# models/line_account_manager.py
from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime

try:
    # ถ้าใช้ PyMongo
    from pymongo.collection import Collection
    from pymongo.database import Database
    from pymongo.errors import DuplicateKeyError
except Exception:  # pragma: no cover
    Collection = Any  # type: ignore
    Database = Any  # type: ignore
    class DuplicateKeyError(Exception):  # fallback
        pass

try:
    # สำหรับ ObjectId (ถ้าใช้ MongoDB)
    from bson import ObjectId
except Exception:  # pragma: no cover
    ObjectId = str  # fallback เพื่อให้โค้ด import ได้ แม้ไม่ได้ใช้ Mongo


def _to_object_id(value: Any) -> ObjectId:
    """
    แปลงค่าเป็น ObjectId ถ้าเป็นสตริงที่ถูกต้อง
    """
    if isinstance(value, ObjectId):
        return value
    if isinstance(value, str):
        try:
            return ObjectId(value)
        except Exception as e:  # แปลงไม่ได้
            raise ValueError(f"ไม่สามารถแปลง '{value}' เป็น ObjectId ได้: {e}")
    raise ValueError(f"รองรับเฉพาะ str หรือ ObjectId เท่านั้น (ได้ {type(value)})")


def _clean_id(doc: Dict[str, Any]) -> Dict[str, Any]:
    """
    แปลง _id จาก ObjectId เป็น str เพื่อส่งต่อไปยังเลเยอร์อื่นๆ ได้สะดวก
    """
    if not doc:
        return doc
    d = dict(doc)
    if d.get("_id") is not None:
        try:
            d["_id"] = str(d["_id"])
        except Exception:
            pass
    return d


class LineAccountManager:
    """
    ตัวจัดการข้อมูลบัญชี LINE OA ใน MongoDB

    โครงสร้างข้อมูลแต่ละเอกสาร (แนะนำ):
    - name: ชื่อบัญชี/โปรเจกต์ (str, required)
    - basic_id: ไอดีที่ขึ้นต้นด้วย @ (str, optional)
    - channel_id: LINE Channel ID (str, required)
    - channel_secret: LINE Channel Secret (str, required)
    - channel_access_token: Access Token (str, required)
    - webhook_endpoint: URL webhook (str, optional)
    - status: สถานะ "active" | "inactive" (str, default="active")
    - created_at / updated_at: เวลา (datetime)
    """

    def __init__(self, db: Database, collection_name: str = "line_accounts") -> None:
        """
        สร้างอินสแตนซ์ตัวจัดการ

        :param db: อ็อบเจกต์ Database ของ PyMongo (เช่น client['mydb'])
        :param collection_name: ชื่อคอลเลกชันที่จะเก็บข้อมูล OA
        """
        self.db: Database = db
        self.collection: Collection = db[collection_name]
        self._ensure_indexes()

    # ------------------------------------------------------------------ #
    # สร้าง index เพื่อกันข้อมูลซ้ำและให้ค้นหาเร็วขึ้น
    # ------------------------------------------------------------------ #
    def _ensure_indexes(self) -> None:
        """
        สร้างดัชนีที่จำเป็น:
        - unique: channel_id (ปกติ 1 OA ต่อ 1 channel_id)
        - unique: basic_id (ถ้ามี)
        """
        try:
            self.collection.create_index("channel_id", unique=True, name="uniq_channel_id")
        except Exception:
            # บางสภาพแวดล้อมอาจไม่มีสิทธิ์สร้าง index ตอนบูทแรก
            pass
        try:
            self.collection.create_index(
                [("basic_id", 1)],
                name="uniq_basic_id",
                unique=True,
                partialFilterExpression={"basic_id": {"$exists": True, "$type": "string"}}
            )
        except Exception:
            pass
        try:
            self.collection.create_index([("created_at", -1)], name="idx_created_at")
        except Exception:
            pass

    # ------------------------------------------------------------------ #
    # CRUD หลัก
    # ------------------------------------------------------------------ #
    def create_account(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        สร้างบัญชี LINE OA ใหม่

        :param payload: ข้อมูลบัญชี OA (ดูโครงสร้างใน class docstring)
        :return: เอกสารที่ถูกสร้าง (มี _id เป็น str)
        """
        required = ["name", "channel_id", "channel_secret", "channel_access_token"]
        missing = [k for k in required if not payload.get(k)]
        if missing:
            raise ValueError(f"ขาดฟิลด์ที่จำเป็น: {', '.join(missing)}")

        now = datetime.utcnow()
        doc: Dict[str, Any] = {
            "name": payload["name"].strip(),
            "basic_id": payload.get("basic_id"),
            "channel_id": str(payload["channel_id"]).strip(),
            "channel_secret": str(payload["channel_secret"]).strip(),
            "channel_access_token": str(payload["channel_access_token"]).strip(),
            "webhook_endpoint": payload.get("webhook_endpoint"),
            "status": (payload.get("status") or "active").strip(),
            "created_at": now,
            "updated_at": now,
        }

        try:
            result = self.collection.insert_one(doc)
            created = self.collection.find_one({"_id": result.inserted_id})
            return _clean_id(created or doc)
        except DuplicateKeyError as e:
            # ชี้เป้า field ที่ชน
            msg = "ข้อมูลซ้ำ (duplicate): "
            if "channel_id" in str(e):
                msg += "channel_id ถูกใช้แล้ว"
            elif "basic_id" in str(e):
                msg += "basic_id ถูกใช้แล้ว"
            else:
                msg += str(e)
            raise ValueError(msg)

    def get_account(self, account_id: str) -> Optional[Dict[str, Any]]:
        """
        ดึงข้อมูลบัญชีจาก _id

        :param account_id: _id ของเอกสาร (string)
        :return: เอกสารบัญชีหรือ None
        """
        oid = _to_object_id(account_id)
        doc = self.collection.find_one({"_id": oid})
        return _clean_id(doc) if doc else None

    def get_by_channel_id(self, channel_id: str) -> Optional[Dict[str, Any]]:
        """
        ดึงข้อมูลบัญชีจาก channel_id
        """
        doc = self.collection.find_one({"channel_id": str(channel_id).strip()})
        return _clean_id(doc) if doc else None

    def list_accounts(
        self,
        filters: Optional[Dict[str, Any]] = None,
        *,
        limit: int = 50,
        skip: int = 0,
        sort: Optional[List[Tuple[str, int]]] = None,
    ) -> List[Dict[str, Any]]:
        """
        คืนรายการบัญชีตามเงื่อนไข

        :param filters: เงื่อนไขค้นหา (เช่น {"status": "active"})
        :param limit: จำนวนสูงสุดที่ดึง (ดีฟอลต์ 50)
        :param skip: ข้ามเอกสารจำนวน n
        :param sort: รายการ sort เช่น [("created_at", -1)]
        """
        q = dict(filters or {})
        cursor = self.collection.find(q)
        if sort:
            cursor = cursor.sort(sort)
        else:
            cursor = cursor.sort([("created_at", -1)])
        if skip:
            cursor = cursor.skip(int(skip))
        if limit:
            cursor = cursor.limit(int(limit))

        return [_clean_id(d) for d in cursor]

    def update_account(self, account_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        อัปเดตข้อมูลบัญชีตาม _id

        :param account_id: _id (string)
        :param updates: ฟิลด์ที่ต้องการแก้ไข
        :return: เอกสารถูกอัปเดตหรือ None ถ้าไม่พบ
        """
        if not updates:
            return self.get_account(account_id)

        # กันการแก้ _id โดยตรง
        updates.pop("_id", None)

        # ทำความสะอาดค่าที่เป็นสตริง
        for k in ("name", "basic_id", "channel_id", "channel_secret", "channel_access_token", "webhook_endpoint", "status"):
            if k in updates and isinstance(updates[k], str):
                updates[k] = updates[k].strip()

        updates["updated_at"] = datetime.utcnow()
        oid = _to_object_id(account_id)

        try:
            res = self.collection.find_one_and_update(
                {"_id": oid},
                {"$set": updates},
                return_document=True  # type: ignore[arg-type]
            )
            return _clean_id(res) if res else None
        except DuplicateKeyError as e:
            msg = "ข้อมูลซ้ำ (duplicate): "
            if "channel_id" in str(e):
                msg += "channel_id ถูกใช้แล้ว"
            elif "basic_id" in str(e):
                msg += "basic_id ถูกใช้แล้ว"
            else:
                msg += str(e)
            raise ValueError(msg)

    def delete_account(self, account_id: str) -> bool:
        """
        ลบบัญชีตาม _id

        :return: True ถ้าลบสำเร็จ / False ถ้าไม่พบ
        """
        oid = _to_object_id(account_id)
        result = self.collection.delete_one({"_id": oid})
        return result.deleted_count > 0

    # ------------------------------------------------------------------ #
    # ยูทิลิตี้เพิ่มเติมที่มักต้องใช้
    # ------------------------------------------------------------------ #
    def rotate_access_token(self, account_id: str, new_token: str) -> Optional[Dict[str, Any]]:
        """
        เปลี่ยน channel_access_token ให้ OA ที่ระบุ
        """
        if not new_token or not isinstance(new_token, str):
            raise ValueError("ต้องระบุ new_token เป็นสตริงที่ไม่ว่าง")
        return self.update_account(account_id, {"channel_access_token": new_token})

    def set_status(self, account_id: str, status: str) -> Optional[Dict[str, Any]]:
        """
        เปลี่ยนสถานะ OA เป็น active/inactive
        """
        status = (status or "").strip().lower()
        if status not in {"active", "inactive"}:
            raise ValueError("status ต้องเป็น 'active' หรือ 'inactive'")
        return self.update_account(account_id, {"status": status})
