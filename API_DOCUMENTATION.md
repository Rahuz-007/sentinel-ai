# API Documentation

## ML Service API (Flask - Port 5000)

Base URL: `http://localhost:5000`

### 1. Predict from Webcam Frame

**Endpoint:** `POST /predict/webcam`

**Description:** Analyzes a single frame from webcam feed and returns behavior classification with risk level.

**Request Body:**
```json
{
  "frame": "data:image/jpeg;base64,/9j/4AAQSkZJRg..."
}
```

**Parameters:**
- `frame` (string, required): Base64-encoded image data. Can include data URI prefix or just the base64 string.

**Response (Success - 200):**
```json
{
  "class": "Fighting",
  "risk": "High",
  "confidence": 0.89
}
```

**Response Fields:**
- `class` (string): Detected behavior class - "Fighting", "Assault", or "Normal"
- `risk` (string): Risk level - "High", "Medium", or "Low"
- `confidence` (float): Model confidence score (0-1)

**Response (Error - 400):**
```json
{
  "error": "No frame provided"
}
```

**Response (Error - 500):**
```json
{
  "error": "Error message details"
}
```

**Example (JavaScript):**
```javascript
// Capture frame from video element
const canvas = document.createElement('canvas');
canvas.width = video.videoWidth;
canvas.height = video.videoHeight;
canvas.getContext('2d').drawImage(video, 0, 0);
const frameData = canvas.toDataURL('image/jpeg');

// Send to API
const response = await fetch('http://localhost:5000/predict/webcam', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ frame: frameData })
});

const result = await response.json();
console.log(result); // { class: "Normal", risk: "Low", confidence: 0.95 }
```

**Alert Trigger:**
- If `risk === "High"`, the system automatically triggers email/SMS alerts
- Alert includes: behavior class, risk level, timestamp, and source ("Webcam Live Feed")

---

### 2. Predict from Video File

**Endpoint:** `POST /predict/video`

**Description:** Analyzes an uploaded video file and returns overall behavior classification.

**Request Body:**
```json
{
  "video_path": "/absolute/path/to/video.mp4"
}
```

**Parameters:**
- `video_path` (string, required): Absolute file path to the video file on the server

**Response (Success - 200):**
```json
{
  "risk_level": "High",
  "behavior": "Assault",
  "timestamp": "2026-01-14T10:30:00.123456"
}
```

**Response Fields:**
- `risk_level` (string): Overall risk level - "High", "Medium", or "Low"
- `behavior` (string): Detected behavior - "Fighting", "Assault", or "Normal"
- `timestamp` (string): ISO 8601 formatted timestamp

**Response (Error - 400):**
```json
{
  "error": "Invalid video path"
}
```

**Response (Error - 500):**
```json
{
  "error": "Error message details"
}
```

**Example (cURL):**
```bash
curl -X POST http://localhost:5000/predict/video \
  -H "Content-Type: application/json" \
  -d '{"video_path": "D:/videos/test.mp4"}'
```

**Alert Trigger:**
- If `risk_level === "High"`, alerts are sent automatically
- Alert includes: behavior, risk level, timestamp, and video filename

### 3. Set Demo Mode
`POST /demo_mode` - Enables simulation of specific behaviors for demo purposes.

**Request Body:**
```json
{
  "behavior": "Fighting" 
}
```
*Valid values are "Fighting", "Assault", "Normal", or null to disable.*

**Response:**
```json
{
  "message": "Demo mode enabled for Fighting"
}
```

---

## Backend API (Port 4005)

Base URL: `http://localhost:4000`

### 1. Upload Video

**Endpoint:** `POST /api/upload`

**Description:** Upload a video file for analysis. The backend saves the file and forwards it to the ML service.

**Request:** Multipart form data

**Form Fields:**
- `video` (file, required): Video file (.mp4, .avi, .mov)

**Response (Success - 200):**
```json
{
  "message": "Video uploaded and analyzed successfully",
  "result": {
    "_id": "65abc123def456789",
    "filename": "video_1705234567890.mp4",
    "risk_level": "High",
    "behavior": "Fighting",
    "timestamp": "2026-01-14T10:30:00.000Z",
    "videoPath": "/uploads/video_1705234567890.mp4"
  }
}
```

**Response (Error - 400):**
```json
{
  "error": "No video file uploaded"
}
```

**Response (Error - 500):**
```json
{
  "error": "Error processing video"
}
```

**Example (JavaScript with FormData):**
```javascript
const formData = new FormData();
formData.append('video', videoFile);

const response = await fetch('http://localhost:4000/api/upload', {
  method: 'POST',
  body: formData
});

const result = await response.json();
console.log(result);
```

**Example (cURL):**
```bash
curl -X POST http://localhost:4000/api/upload \
  -F "video=@/path/to/video.mp4"
```

---

### 2. Get Analysis Results

**Endpoint:** `GET /api/results`

**Description:** Retrieve all video analysis results from the database.

**Query Parameters:**
- `limit` (number, optional): Maximum number of results to return (default: all)
- `skip` (number, optional): Number of results to skip for pagination

**Response (Success - 200):**
```json
[
  {
    "_id": "65abc123def456789",
    "filename": "video_1705234567890.mp4",
    "risk_level": "High",
    "behavior": "Fighting",
    "timestamp": "2026-01-14T10:30:00.000Z",
    "videoPath": "/uploads/video_1705234567890.mp4"
  },
  {
    "_id": "65abc123def456790",
    "filename": "video_1705234567891.mp4",
    "risk_level": "Low",
    "behavior": "Normal",
    "timestamp": "2026-01-14T10:35:00.000Z",
    "videoPath": "/uploads/video_1705234567891.mp4"
  }
]
```

**Response (Error - 500):**
```json
{
  "error": "Error fetching results"
}
```

**Example (JavaScript):**
```javascript
const response = await fetch('http://localhost:4000/api/results?limit=10');
const results = await response.json();
console.log(results);
```

**Example (cURL):**
```bash
curl http://localhost:4000/api/results
```

---

### 3. Get Alerts History

**Endpoint:** `GET /api/alerts`

**Description:** Retrieve history of triggered alerts (high-risk detections).

**Query Parameters:**
- `limit` (number, optional): Maximum number of alerts to return
- `startDate` (string, optional): Filter alerts after this date (ISO 8601)
- `endDate` (string, optional): Filter alerts before this date (ISO 8601)

**Response (Success - 200):**
```json
[
  {
    "_id": "65abc123def456791",
    "behavior": "Fighting",
    "risk_level": "High",
    "timestamp": "2026-01-14T10:30:00.000Z",
    "source": "Webcam Live Feed",
    "alertSent": true
  },
  {
    "_id": "65abc123def456792",
    "behavior": "Assault",
    "risk_level": "High",
    "timestamp": "2026-01-14T11:00:00.000Z",
    "source": "Video: suspicious_activity.mp4",
    "alertSent": true
  }
]
```

**Example (JavaScript):**
```javascript
const response = await fetch('http://localhost:4000/api/alerts?limit=20');
const alerts = await response.json();
console.log(alerts);
```

---

### 4. Get Single Result

**Endpoint:** `GET /api/results/:id`

**Description:** Retrieve a specific analysis result by ID.

**URL Parameters:**
- `id` (string, required): MongoDB ObjectId of the result

**Response (Success - 200):**
```json
{
  "_id": "65abc123def456789",
  "filename": "video_1705234567890.mp4",
  "risk_level": "High",
  "behavior": "Fighting",
  "timestamp": "2026-01-14T10:30:00.000Z",
  "videoPath": "/uploads/video_1705234567890.mp4"
}
```

**Response (Error - 404):**
```json
{
  "error": "Result not found"
}
```

**Example (cURL):**
```bash
curl http://localhost:4000/api/results/65abc123def456789
```

---

## Error Codes

| Code | Meaning | Description |
|------|---------|-------------|
| 200 | OK | Request successful |
| 400 | Bad Request | Invalid request parameters |
| 404 | Not Found | Resource not found |
| 500 | Internal Server Error | Server-side error |

---

## Rate Limiting

Currently, no rate limiting is implemented. For production use, consider:
- Implementing rate limiting middleware
- Adding authentication/authorization
- Using API keys for access control

---

## CORS Configuration

Both ML service and backend have CORS enabled for development:
- Allows all origins (`*`)
- For production, configure specific allowed origins

---

## Data Models

### Video Analysis Result (MongoDB)
```javascript
{
  filename: String,        // Original filename
  risk_level: String,      // "High", "Medium", "Low"
  behavior: String,        // "Fighting", "Assault", "Normal"
  timestamp: Date,         // Analysis timestamp
  videoPath: String        // Path to uploaded video
}
```

### Alert Record (MongoDB)
```javascript
{
  behavior: String,        // Detected behavior
  risk_level: String,      // Risk level
  timestamp: Date,         // Detection timestamp
  source: String,          // "Webcam Live Feed" or "Video: filename"
  alertSent: Boolean       // Whether alert was sent successfully
}
```

---

## Testing the API

### Using Postman

1. **Import Collection:**
   - Create new collection "Behavioral Risk Analysis"
   - Add requests for each endpoint

2. **Test Webcam Prediction:**
   - Method: POST
   - URL: http://localhost:5000/predict/webcam
   - Body: JSON with base64 frame

3. **Test Video Upload:**
   - Method: POST
   - URL: http://localhost:4000/api/upload
   - Body: form-data with video file

### Using Python

```python
import requests
import base64

# Test webcam prediction
with open('test_image.jpg', 'rb') as f:
    img_data = base64.b64encode(f.read()).decode()

response = requests.post(
    'http://localhost:5000/predict/webcam',
    json={'frame': f'data:image/jpeg;base64,{img_data}'}
)
print(response.json())

# Test video upload
with open('test_video.mp4', 'rb') as f:
    files = {'video': f}
    response = requests.post(
        'http://localhost:4000/api/upload',
        files=files
    )
print(response.json())
```

---

## WebSocket Support (Future Enhancement)

For real-time updates, consider implementing WebSocket connections:
- Live webcam stream processing
- Real-time alert notifications
- Dashboard live updates

---

**Last Updated:** January 14, 2026
