# LINE Keys Captured from dooslip.com

## ข้อมูลที่เห็นจาก Modal "LINE Keys"

### xLineAccess
```
eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJqdGkiOiJkZGE0OTVhMS1iZjI1LTRkZGItYWQ3YS05MjM1MTAyNzg2NTIiLCJhdWQiOiJMSU5FIiwiaWF0IjoxNzcwMTkxNjI0LCJleHAiOjE3N...
```

### xHmac
```
AMeFfI4OaA7jeTwS3eZauDdyJTAwYLG6R8f7uX8lILo=
```

### Chat MID
```
UZQkbeI540znaMoEfVuS1ZJloaaK6lmDu69hgBrFZoc0
```

### cURL Bash (ต้องดึงจาก textarea)
```
curl 'https://line-chrome-gw.line-apps.com/api/talk/thrift/Talk/TalkService/getLastOpRevision' \ -H 'accept: application/json, text/plain, */*' \ -H '...
```

## สถานะ
- **Status**: expired
- **ดึงเมื่อ**: 4/2/2569 14:53:55

## หมายเหตุ
- ต้องเปิด DevTools (F12) และไปที่ Network tab เพื่อดู getRecentMessagesV2 request
- จากนั้นคัดลอก cURL (Bash) จาก request นั้น
