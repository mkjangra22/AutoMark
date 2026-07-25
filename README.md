# 🎓 AutoMark - AI Facial Recognition Attendance Platform

[![React](https://img.shields.io/badge/React-18.x-61DAFB?logo=react&logoColor=black)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-5.x-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3.x-38B2AC?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Firebase](https://img.shields.io/badge/Firebase-Firestore-FFCA28?logo=firebase&logoColor=black)](https://firebase.google.com/)
[![Python OpenCV](https://img.shields.io/badge/Python-OpenCV%20LBPH-3776AB?logo=python&logoColor=white)](https://opencv.org/)

---

## 🌟 About AutoMark

**AutoMark** is a modern, full-stack automated attendance platform designed for educational institutions. It replaces manual roll-call registers and proxy sign-ins with an intelligent, automated workflow powered by **AI Facial Recognition**, **GPS Geo-Fencing**, and **Instant Parent SMS Communication**.

By combining real-time camera scanning with location bounds verification, AutoMark delivers seamless attendance management for teachers, complete attendance tracking for students, and full administrative oversight for school leaders.

---

## ✨ Key Features & Capabilities

### 📷 1. Real-Time AI Facial Recognition
- **Webcam Scan Engine**: Automatically identifies and matches registered student faces from live camera feeds using OpenCV LBPH (Local Binary Patterns Histograms) face recognition.
- **High-Speed Matching**: Fast verification with instant status updates and minimal scan latency.
- **Automated Dataset Registration**: Supports capturing live webcam samples or uploading photo datasets to train the recognition model for new students.

### 📍 2. GPS Campus Geo-Fencing
- **Premises Boundaries**: Uses GPS geolocation checks (Haversine formula) to ensure attendance can only be marked within verified school premises coordinates.
- **Testing Override**: Built-in developer mock location toggle for testing and system verification outside school coordinates.

### 💬 3. Parent SMS Notifications
- **Instant SMS Delivery**: Sends real-time arrival and presence updates directly to parents' registered mobile phones as soon as attendance is recorded.

---

## 👥 Multi-Role User Portals

### 🍎 Teacher Portal
- **Dashboard & Camera Scanner**: Start the live webcam scanning loop to mark student attendance automatically.
- **Class Roster Management**: Manually adjust attendance status (*Present* or *Absent*) per assigned class.
- **Leave Application Approvals**: Review student leave requests and mark them as *Approved* or *Rejected*.
- **Class Filtering**: Filter student lists across multiple assigned classes.

### 🎓 Student Portal
- **Personal Metrics Dashboard**: View total active school days, present days count, and overall attendance percentage.
- **Digital Leave Submissions**: Apply for upcoming leaves with built-in validation (prevents weekend and holiday applications).
- **Attendance History Log**: Detailed log of daily attendance records and timestamped arrivals.

### ⚙️ Admin Dashboard
- **School Metrics Overview**: System-wide statistics covering total enrolled students, present count today, absent count today, and overall attendance percentage.
- **User Directory**: View and manage user accounts across roles (*Student*, *Teacher*, *Admin*), generate temporary login credentials, and reset account passwords.
- **Class & Department Configuration**: Create new classes and departments and map students and faculty members.
- **Face Registration & Model Trainer**: Capture webcam sample photos or upload photo datasets to retrain the recognition model.

---

## 🛠️ Technology Stack & Architecture

| Layer | Technologies |
| :--- | :--- |
| **Frontend UI** | React 18, Vite, TailwindCSS, Lucide Icons, React Router DOM |
| **Database & Cloud** | Firebase Firestore DB, Firebase Authentication |
| **AI & Vision Model** | Python 3, OpenCV (`cv2.face.LBPHFaceRecognizer`) |
| **Algorithms** | LBPH Facial Embeddings, Haversine GPS Distance Calculation |

```
AutoMark/
├── backend/                  # Python LBPH Recognition Engine
│   ├── lbph/                 # Model Trainer, Detector & Parameters
│   └── server.py             # Recognition API Endpoint
│
├── src/                      # React Frontend Application
│   ├── App.jsx               # Landing Page & Public Showcase
│   ├── App2.jsx              # App Core (Login & Role Dashboards)
│   ├── main.jsx             # React DOM Router Entry Point
│   └── index.css             # Tailwind Directives & Styling System
│
└── public/                   # Asset Resources & Branding Logos
```

---

## 🔒 Security & Privacy Design

- **Encrypted Authentication**: User authentication backed by Firebase Authentication with secure temporary password generation.
- **Privacy Compliance**: Face embeddings and attendance records are securely managed within Firestore and local AI model structures.
- **Role Isolation**: Strict data segregation ensuring students, teachers, and admins only access authorized resources.

---

> ℹ️ **Note**: This project is intended for educational and portfolio purposes.

## 👩‍💻 Developed By

**Mayank Kumar**

---

⭐ **If you found this project useful, consider giving it a Star on GitHub!**

<p align="center">
  Developed for <strong>Smart Schools & Educational Digital Transformation</strong>.
</p>