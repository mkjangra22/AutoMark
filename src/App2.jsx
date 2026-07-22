import React, { useState, useEffect, useRef } from 'react';
import { Camera, User, Calendar, BarChart3, MapPin, Bell, LogOut, Menu, X } from 'lucide-react';
import { ref, uploadString, getDownloadURL } from "firebase/storage";
import { db, auth, storage, firebaseConfig } from './firebase';
import { initializeApp, getApps } from "firebase/app";
import { 
  signInWithEmailAndPassword, 
  signOut, 
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  getAuth
} from "firebase/auth";
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  addDoc, 
  updateDoc, 
  query, 
  where 
} from "firebase/firestore";

// Initialize a secondary App for Admin creating new user credentials
let secondaryAuth;
const apps = getApps();
let secondaryApp = apps.find(app => app.name === "SecondaryApp");
if (!secondaryApp) {
  secondaryApp = initializeApp(firebaseConfig, "SecondaryApp");
}
secondaryAuth = getAuth(secondaryApp);

// Configuration flag to enable or disable Firebase Storage uploads (fallback activates if false or if upload fails)
const USE_FIREBASE_STORAGE = false;
const FACE_API_URL = import.meta.env.VITE_FACE_API_URL || 'http://127.0.0.1:8000';
const REQUIRED_STABLE_RECOGNITIONS = 3;
const DEFAULT_PROFILE_IMAGE = '/AutoMark-logo__.png';

const getLocalDateKey = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

// Helper function to compress image (max 320x240, 0.5 JPEG quality, target payload < 20KB)
const compressImageToBase64 = async (rawPngDataUrl, maxWidth = 320, maxHeight = 240, quality = 0.5) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let w = img.width;
      let h = img.height;
      
      // Calculate aspect ratio scale to fit within boundaries
      if (w > maxWidth) {
        h = Math.round((h * maxWidth) / w);
        w = maxWidth;
      }
      if (h > maxHeight) {
        w = Math.round((w * maxHeight) / h);
        h = maxHeight;
      }
      
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      
      // Convert to compressed JPEG data URL
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      resolve(rawPngDataUrl); // Fallback to raw if image loading fails
    };
    img.src = rawPngDataUrl;
  });
};

const AutomatedAttendanceSystem = () => {
  const [user, setUser] = useState(null);
  const [loginData, setLoginData] = useState({ username: '', password: '', role: 'teacher' });
  const [attendanceData, setAttendanceData] = useState({});
  const [leaveApplications, setLeaveApplications] = useState({}); // State for leave applications
  const [leaveReason, setLeaveReason] = useState(''); // State for leave reason input
  const [currentView, setCurrentView] = useState('login');
  const [cameraActive, setCameraActive] = useState(false);
  const [students, setStudents] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [geoLocation, setGeoLocation] = useState(null);
  const [schoolLocation] = useState({ lat: 28.976639, lng: 77.033000 }); // School location (Sonipat, Haryana)
  const [seeding, setSeeding] = useState(false);
  const [adminView, setAdminView] = useState('overview');
  const [usersList, setUsersList] = useState([]);
  const [createUserForm, setCreateUserForm] = useState({ email: '', name: '', role: 'student', class: '', rollNo: '', department: '' });
  const [editUserForm, setEditUserForm] = useState(null);
  const [createdCredentials, setCreatedCredentials] = useState(null);

  // Facial recognition registration & continuous scanning states/refs
  const [registeringStudent, setRegisteringStudent] = useState(null);
  const [isRegisteringFace, setIsRegisteringFace] = useState(false);
  const [registerCaptureProgress, setRegisterCaptureProgress] = useState(0);
  const [registerCapturing, setRegisterCapturing] = useState(false);
  const [registerStatus, setRegisterStatus] = useState('');
  const [lastMarkedStatus, setLastMarkedStatus] = useState('');
  const registerVideoRef = useRef(null);
  const registerCanvasRef = useRef(null);
  const registerIntervalRef = useRef(null);
  const registerCapturingRef = useRef(false);
  const videoIntervalRef = useRef(null);
  const uploadingIdsRef = useRef(new Set());
  const recognitionCandidateRef = useRef({ label: '', consecutive: 0 });
  const recognitionRequestInFlightRef = useRef(false);

  const holidays = ['2025-01-26', '2025-08-15', '2025-10-02']; // Example holidays

  const defaultUsers = [
    {
      email: 'teacher@automark.com',
      password: 'password123',
      userData: {
        name: 'Taruna Chawla',
        role: 'teacher',
        class: '5A',
        studentId: 'T001',
        email: 'teacher@automark.com'
      }
    },
    {
      email: 'admin@automark.com',
      password: 'password123',
      userData: {
        name: 'PIET',
        role: 'admin',
        class: '',
        studentId: 'A001',
        email: 'admin@automark.com'
      }
    },
    {
      email: 'mayank@automark.com',
      password: 'password123',
      userData: {
        name: 'Mayank Kumar',
        role: 'student',
        class: 'AIML 5th A',
        studentId: '1',
        rollNo: '2823392',
        email: 'mayank@automark.com'
      }
    },
    {
      email: 'bhavya@automark.com',
      password: 'password123',
      userData: {
        name: 'Bhavya',
        role: 'student',
        class: '5A',
        studentId: '2',
        rollNo: '250085',
        email: 'bhavya@automark.com'
      }
    },
    {
      email: 'vaani@automark.com',
      password: 'password123',
      userData: {
        name: 'Vaani Mangal',
        role: 'student',
        class: '5A',
        studentId: '3',
        rollNo: '103',
        email: 'vaani@automark.com'
      }
    },
    {
      email: 'hemant@automark.com',
      password: 'password123',
      userData: {
        name: 'Hemant',
        role: 'student',
        class: '5A',
        studentId: '4',
        rollNo: '104',
        email: 'hemant@automark.com'
      }
    },
    {
      email: 'vineet@automark.com',
      password: 'password123',
      userData: {
        name: 'Vineet Jangra',
        role: 'student',
        class: '5A',
        studentId: '5',
        rollNo: '105',
        email: 'vineet@automark.com'
      }
    }
  ];

  const handleSeedDatabase = async () => {
    setSeeding(true);
    try {
      // 1. Seed users
      for (const u of defaultUsers) {
        try {
          let credential;
          try {
            credential = await createUserWithEmailAndPassword(auth, u.email, u.password);
          } catch (createErr) {
            if (createErr.code === 'auth/email-already-in-use') {
              credential = await signInWithEmailAndPassword(auth, u.email, u.password);
            } else {
              throw createErr;
            }
          }
           const uid = credential.user.uid;
          
          await setDoc(doc(db, "users", uid), {
            uid,
            ...u.userData,
            descriptors: []
          });
        } catch (err) {
          console.error(`Error seeding user ${u.email}:`, err);
        }
      }

      await signOut(auth);
      setUser(null);
      setCurrentView('login');

      // 2. Seed default attendance records
      const initialAttendance = [
        { studentId: '1', date: '2025-10-01', status: 'present', timestamp: '08:45' },
        { studentId: '1', date: '2025-10-02', status: 'present', timestamp: '08:50' },
        { studentId: '1', date: '2025-10-03', status: 'absent', timestamp: null },
        { studentId: '1', date: '2025-10-04', status: 'present', timestamp: '09:00' },
        { studentId: '1', date: '2025-10-05', status: 'present', timestamp: '08:55' },
        
        { studentId: '2', date: '2025-10-01', status: 'present', timestamp: '08:50' },
        { studentId: '2', date: '2025-10-02', status: 'present', timestamp: '08:48' },
        
        { studentId: '3', date: '2025-10-01', status: 'present', timestamp: '08:40' },
        { studentId: '3', date: '2025-10-02', status: 'absent', timestamp: null }
      ];

      for (const record of initialAttendance) {
        await setDoc(doc(db, "attendance", `${record.studentId}_${record.date}`), record);
      }

      // 3. Seed default leave requests
      const initialLeaves = [
        { studentId: '1', date: '2025-10-06', reason: 'Fever and cold', status: 'pending', createdAt: new Date().toISOString() },
        { studentId: '2', date: '2025-10-07', reason: 'Family function', status: 'approved', createdAt: new Date().toISOString() }
      ];

      const leaveSnapshot = await getDocs(collection(db, "leaveRequests"));
      if (leaveSnapshot.empty) {
        for (const leave of initialLeaves) {
          await addDoc(collection(db, "leaveRequests"), leave);
        }
      }

      // Reload backend cache
      try {
        await fetch(`${FACE_API_URL}/reload`, { method: 'POST' });
        console.log("Backend student cache reloaded successfully.");
      } catch (reloadErr) {
        console.error("Failed to reload backend student cache:", reloadErr);
      }

      alert("Demo database seeded successfully! You can now log in using:\n- Teacher: teacher / password123\n- Student: mayank / password123\n- Admin: admin / password123");
    } catch (err) {
      console.error("Error seeding database:", err);
      alert(`Error seeding database: ${err.message}`);
    } finally {
      setSeeding(false);
    }
  };

  // Check and seed automatically on load if empty
  useEffect(() => {
    const checkAndSeed = async () => {
      try {
        const usersSnap = await getDocs(collection(db, "users"));
        if (usersSnap.empty) {
          console.log("Firestore 'users' collection is empty. Seeding database automatically...");
          await handleSeedDatabase();
        }
      } catch (err) {
        console.error("Error checking database state:", err);
      }
    };
    checkAndSeed();
  }, []);

  // Load leave applications from Firestore
  const loadLeaveApplications = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, "leaveRequests"));
      const leaveMap = {};
      querySnapshot.forEach(doc => {
        const data = doc.data();
        const leave = { id: doc.id, ...data };
        if (!leaveMap[leave.studentId]) {
          leaveMap[leave.studentId] = [];
        }
        leaveMap[leave.studentId].push(leave);
      });
      setLeaveApplications(leaveMap);
    } catch (error) {
      console.error('Error loading leave applications from Firestore:', error);
    }
  };

  useEffect(() => {
    loadLeaveApplications();
  }, []);

  const loadAllUsers = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, "users"));
      const list = [];
      querySnapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (data.deleted !== true) {
          list.push({ uid: docSnap.id, ...data });
        }
      });
      setUsersList(list);
    } catch (error) {
      console.error("Error loading users from Firestore:", error);
    }
  };

  useEffect(() => {
    if (user?.role === 'admin') {
      loadAllUsers();
    }
  }, [user]);

  // Load students from Firestore
  useEffect(() => {
    const loadStudents = async () => {
      try {
        const q = query(collection(db, "users"), where("role", "==", "student"));
        const querySnapshot = await getDocs(q);
        const studentList = [];
        querySnapshot.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.deleted !== true) {
            studentList.push({
              id: data.studentId || docSnap.id,
              docId: docSnap.id,
              ...data
            });
          }
        });
        studentList.sort((a, b) => (a.id || "").localeCompare(b.id || ""));
        setStudents(studentList);
      } catch (error) {
        console.error("Error loading students from Firestore:", error);
      }
    };
    loadStudents();
  }, []);

  // Get current geolocation
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setGeoLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (error) => {
          console.error('Error getting location:', error);
        }
      );
    }
  }, []);

  const handleLogin = async () => {
    if (loginData.username && loginData.password) {
      let email = loginData.username;
      if (!email.includes('@')) {
        email = `${email.toLowerCase().trim()}@automark.com`;
      }
      try {
        const userCredential = await signInWithEmailAndPassword(auth, email, loginData.password);
        const firebaseUser = userCredential.user;

        // Fetch user doc from Firestore
        const userDocRef = doc(db, "users", firebaseUser.uid);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
          const userData = userDoc.data();
          if (userData.disabled === true || userData.deleted === true) {
            alert("Access denied. Your account is disabled or deleted.");
            await signOut(auth);
            return;
          }
          if (userData.role !== loginData.role) {
            alert(`Access denied. You are not registered as a ${loginData.role}.`);
            await signOut(auth);
            return;
          }

          setUser({
            role: userData.role,
            name: userData.name,
            id: userData.studentId || userData.uid,
            class: userData.class || '',
            email: userData.email,
            photo: userData.photo || ''
          });

          if (userData.role === 'teacher') {
            setCurrentView('teacher-dashboard');
          } else if (userData.role === 'student') {
            setCurrentView('student-dashboard');
          } else if (userData.role === 'admin') {
            setCurrentView('admin-dashboard');
          }
        } else {
          alert("User profile not found in database.");
          await signOut(auth);
        }
      } catch (error) {
        console.error("Login error:", error);
        alert(`Authentication failed: ${error.message}`);
      }
    } else {
      alert("Please fill in both username/email and password.");
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Error signing out:", err);
    }
    setUser(null);
    setCurrentView('login');
    setLoginData({ username: '', password: '', role: 'teacher' });
  };

  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    // Haversine formula to calculate distance between two points
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c * 1000; // Distance in meters
  };

  const isWithinSchoolPremises = () => {
    if (!geoLocation) return false;
    const distance = calculateDistance(
      geoLocation.lat, geoLocation.lng,
      schoolLocation.lat, schoolLocation.lng
    );
    return distance <= 500; // Within 500 meters of school
  };

  const markAttendance = async (studentId, status, photoUrl = null, silent = false) => {
    if (!isWithinSchoolPremises()) {
      alert('Attendance can only be marked within school premises');
      return false;
    }

    const today = getLocalDateKey();
    const time = new Date().toTimeString().split(' ')[0].substring(0, 5);

    // Find student details
    const student = students.find(s => s.id === studentId);
    const studentName = student ? student.name : '';
    const studentRollNo = student ? (student.rollNo || '') : '';

    try {
      const attendanceRef = doc(db, "attendance", `${studentId}_${today}`);
      const attendanceRecord = {
        studentId,
        date: today,
        status,
        timestamp: status === 'present' ? time : null,
        photoUrl: photoUrl || null,
        // Audit and architecture required fields
        uid: studentId,
        name: studentName,
        rollNo: studentRollNo
      };

      await setDoc(attendanceRef, attendanceRecord);

      // Update local state
      setAttendanceData(prev => ({
        ...prev,
        [studentId]: [
          ...(prev[studentId] || []).filter(record => record.date !== today),
          { date: today, status, timestamp: status === 'present' ? time : null, photoUrl }
        ]
      }));

      // Simulate SMS notification to parents
      if (status === 'absent') {
        console.log(`SMS sent to parents of ${studentName}: Your child is absent today (${today})`);
      }

      if (!silent) {
        alert(`Attendance marked as ${status} successfully.`);
      }
      return true;
    } catch (error) {
      console.error("Error saving attendance to Firestore:", error);
      if (!silent) {
        alert("Failed to save attendance. Please try again.");
      }
      return false;
    }
  };

  // Load attendance data from Firestore
  useEffect(() => {
    const loadAttendanceData = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, "attendance"));
        const attendanceMap = {};
        querySnapshot.forEach(docSnap => {
          const data = docSnap.data();
          const studentId = data.studentId;
          if (!attendanceMap[studentId]) {
            attendanceMap[studentId] = [];
          }
          attendanceMap[studentId].push({
            date: data.date,
            status: data.status,
            timestamp: data.timestamp,
            photoUrl: data.photoUrl || null
          });
        });
        setAttendanceData(attendanceMap);
      } catch (error) {
        console.error("Error loading attendance from Firestore:", error);
      }
    };

    if (students.length > 0) {
      loadAttendanceData();
    }
  }, [students]);

  const videoRef = useRef(null);
  const [loadingModels, setLoadingModels] = useState(false);

  const startFacialRecognition = () => {
    setLastMarkedStatus('');
    recognitionCandidateRef.current = { label: '', consecutive: 0 };
    setCameraActive(true);
    startVideo();
  };

  const startVideo = () => {
    navigator.mediaDevices.getUserMedia({ video: {} })
      .then((stream) => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      })
      .catch((err) => {
        console.error('Error accessing webcam:', err);
        alert('Error accessing webcam');
        setCameraActive(false);
      });
  };

  const handleVideoOnPlay = async () => {
    const canvas = document.createElement('canvas');
    canvas.style.position = 'absolute';
    canvas.style.top = '0px';
    canvas.style.left = '0px';
    const container = videoRef.current.parentNode;
    
    // Clear any existing canvas
    const existingCanvas = container.querySelector('canvas');
    if (existingCanvas) {
      existingCanvas.remove();
    }
    container.appendChild(canvas);

    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;

    videoIntervalRef.current = setInterval(async () => {
      if (!videoRef.current || videoRef.current.paused || videoRef.current.ended) {
        clearInterval(videoIntervalRef.current);
        videoIntervalRef.current = null;
        return;
      }

      // Do not queue another recognition request while the previous frame is processing.
      if (recognitionRequestInFlightRef.current) return;
      recognitionRequestInFlightRef.current = true;

      // Capture photo from video stream for analysis
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = videoRef.current.videoWidth;
      tempCanvas.height = videoRef.current.videoHeight;
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.drawImage(videoRef.current, 0, 0, tempCanvas.width, tempCanvas.height);
      const photoDataUrl = tempCanvas.toDataURL('image/jpeg', 0.6); // slight compression to speed up transfer

      try {
        const response = await fetch(`${FACE_API_URL}/recognize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: photoDataUrl })
        });
        if (!response.ok) {
          throw new Error(`Recognition service returned ${response.status}`);
        }
        const resData = await response.json();
        
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (resData.box) {
          const { x, y, width, height } = resData.box;
          
          let color = 'rgba(239, 68, 68, 1)'; // Red for unknown
          let labelText = resData.reason || 'Unknown student';
          
          if (resData.match) {
            const previous = recognitionCandidateRef.current;
            const consecutive = previous.label === resData.label ? previous.consecutive + 1 : 1;
            recognitionCandidateRef.current = { label: resData.label, consecutive };
            const stableMatch = consecutive >= REQUIRED_STABLE_RECOGNITIONS;

            // Check if attendance already marked today
            const today = getLocalDateKey();
            const studentRecords = attendanceData[resData.label] || [];
            const alreadyMarked = studentRecords.some(r => r.date === today);
            
            if (alreadyMarked) {
              color = 'rgba(245, 158, 11, 1)'; // Orange for already present
              labelText = `${resData.name} (already present)`;
            } else if (!stableMatch) {
              color = 'rgba(245, 158, 11, 1)';
              labelText = `${resData.name} - confirming ${consecutive}/${REQUIRED_STABLE_RECOGNITIONS}`;
            } else {
              color = 'rgba(16, 185, 129, 1)'; // Green for recognized
              labelText = `${resData.name} (Roll: ${resData.rollNo}, verified)`;
              
              // Proceed with marking attendance
              if (!uploadingIdsRef.current.has(resData.label)) {
                uploadingIdsRef.current.add(resData.label);

                const saveAttendancePhoto = async () => {
                  let photoUrlToSave = null;
                  let uploadSuccessful = false;

                  if (USE_FIREBASE_STORAGE) {
                    try {
                      const storageRef = ref(storage, `attendance_photos/${resData.label}_${Date.now()}.png`);
                      const snapshot = await uploadString(storageRef, photoDataUrl, 'data_url');
                      const downloadUrl = await getDownloadURL(snapshot.ref);
                      photoUrlToSave = downloadUrl;
                      uploadSuccessful = true;
                    } catch (storageErr) {
                      console.warn('[Attendance Save] Storage upload failed, utilizing fallback.', storageErr);
                    }
                  }

                  if (!uploadSuccessful) {
                    try {
                      photoUrlToSave = await compressImageToBase64(photoDataUrl);
                    } catch (compressErr) {
                      console.error('[Attendance Save] Photo compression failed:', compressErr);
                      photoUrlToSave = photoDataUrl;
                    }
                  }

                  try {
                    const saved = await markAttendance(resData.label, 'present', photoUrlToSave, true);
                    if (saved) {
                      const time = new Date().toTimeString().split(' ')[0].substring(0, 5);
                      setLastMarkedStatus(`Marked present: ${resData.name} (Roll: ${resData.rollNo}) at ${time}`);
                    }
                  } catch (markErr) {
                    console.error('[Attendance Save] Failed to mark attendance in Firestore:', markErr);
                  } finally {
                    uploadingIdsRef.current.delete(resData.label);
                  }
                };

                saveAttendancePhoto();
              }
            }
          } else {
            recognitionCandidateRef.current = { label: '', consecutive: 0 };
          }

          // Draw bounding box
          ctx.strokeStyle = color;
          ctx.lineWidth = 3;
          ctx.strokeRect(x, y, width, height);

          // Draw label background
          ctx.fillStyle = color;
          ctx.font = '14px sans-serif';
          const textWidth = ctx.measureText(labelText).width;
          ctx.fillRect(x, y - 25, textWidth + 10, 25);

          // Draw label text
          ctx.fillStyle = '#ffffff';
          ctx.fillText(labelText, x + 5, y - 7);
        } else {
          recognitionCandidateRef.current = { label: '', consecutive: 0 };
        }
      } catch (err) {
        console.error("Error recognizing face via backend:", err);
      } finally {
        recognitionRequestInFlightRef.current = false;
      }
    }, 1000);
  };

  const stopFacialRecognition = () => {
    setCameraActive(false);
    recognitionCandidateRef.current = { label: '', consecutive: 0 };
    recognitionRequestInFlightRef.current = false;
    if (videoIntervalRef.current) {
      clearInterval(videoIntervalRef.current);
      videoIntervalRef.current = null;
    }
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    if (videoRef.current) {
      const container = videoRef.current.parentNode;
      const canvas = container.querySelector('canvas');
      if (canvas) {
        canvas.remove();
      }
    }
  };

  const startRegisterFace = (student) => {
    setRegisteringStudent(student);
    setIsRegisteringFace(true);
    setRegisterCaptureProgress(0);
    setRegisterCapturing(false);
    setRegisterStatus('Camera starting... Align face in target area.');
  };

  const startRegisterVideo = () => {
    navigator.mediaDevices.getUserMedia({ video: {} })
      .then((stream) => {
        if (registerVideoRef.current) {
          registerVideoRef.current.srcObject = stream;
        }
      })
      .catch((err) => {
        console.error('Error accessing webcam for registration:', err);
        alert('Error accessing webcam for registration. Make sure permissions are granted.');
        closeRegisterFaceModal();
      });
  };

  const closeRegisterFaceModal = () => {
    registerCapturingRef.current = false;
    setRegisterCapturing(false);
    if (registerIntervalRef.current) {
      clearInterval(registerIntervalRef.current);
      registerIntervalRef.current = null;
    }
    if (registerVideoRef.current && registerVideoRef.current.srcObject) {
      registerVideoRef.current.srcObject.getTracks().forEach(track => track.stop());
      registerVideoRef.current.srcObject = null;
    }
    setRegisteringStudent(null);
    setIsRegisteringFace(false);
    setRegisterCaptureProgress(0);
    setRegisterStatus('');
  };

  const handleRegisterVideoOnPlay = () => {
    if (!registerVideoRef.current) return;

    const canvas = registerCanvasRef.current;
    if (!canvas) return;

    let lastCenter = null;
    let lastCaptureTime = 0;
    const photos = [];
    let capturesCount = 0;

    registerIntervalRef.current = setInterval(async () => {
      if (!registerVideoRef.current || registerVideoRef.current.paused || registerVideoRef.current.ended) {
        clearInterval(registerIntervalRef.current);
        registerIntervalRef.current = null;
        return;
      }

      const videoW = registerVideoRef.current.videoWidth;
      const videoH = registerVideoRef.current.videoHeight;
      if (!videoW || !videoH) return; // wait for metadata

      if (canvas.width !== videoW || canvas.height !== videoH) {
        canvas.width = videoW;
        canvas.height = videoH;
      }

      // Capture frame
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = videoW;
      tempCanvas.height = videoH;
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.drawImage(registerVideoRef.current, 0, 0, videoW, videoH);
      const photoDataUrl = tempCanvas.toDataURL('image/jpeg', 0.6);

      let detection = null;
      try {
        const response = await fetch(`${FACE_API_URL}/recognize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: photoDataUrl })
        });
        detection = await response.json();
      } catch (detectErr) {
        console.error('Face detection error via backend:', detectErr);
      }

      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (detection && detection.box) {
        let boxColor = 'rgba(16, 185, 129, 1)'; // Green when face detected
        let label = 'Face Detected';

        const { x, y, width, height } = detection.box;

        if (registerCapturingRef.current) {
          label = `Capturing Sample ${capturesCount}/10`;

          const center = { x: x + width / 2, y: y + height / 2 };
          const now = Date.now();

          // We require at least 1 second between captures, and slight movement
          if (now - lastCaptureTime >= 1000) {
            let moved = true;
            if (lastCenter && capturesCount > 0) {
              const dist = Math.sqrt(Math.pow(center.x - lastCenter.x, 2) + Math.pow(center.y - lastCenter.y, 2));
              if (dist < 15) { // Enforce a head movement threshold of 15px
                moved = false;
                setRegisterStatus('Move Head Slightly');
                boxColor = 'rgba(245, 158, 11, 1)'; // Orange warning
                label = 'Move Head Slightly';
              }
            }

            if (moved) {
              capturesCount++;
              lastCaptureTime = now;
              lastCenter = center;
              setRegisterCaptureProgress(capturesCount);
              
              if (capturesCount >= 10) {
                setRegisterStatus('Registration Complete');
              } else {
                setRegisterStatus(`Capturing Sample ${capturesCount}/10`);
              }

              photos.push(photoDataUrl);

              if (capturesCount >= 10) {
                registerCapturingRef.current = false;
                setRegisterCapturing(false);
                clearInterval(registerIntervalRef.current);
                registerIntervalRef.current = null;

                setRegisterStatus('Registering face model. Please wait...');
                
                try {
                  console.log('[FaceReg Save] Registering LBP samples for student:', registeringStudent.uid, registeringStudent.name);
                  
                  const registrationResponse = await fetch(`${FACE_API_URL}/register_faces`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ student_id: registeringStudent.uid, images: photos })
                  });
                  if (!registrationResponse.ok) {
                    throw new Error('Face registration service is unavailable.');
                  }
                  const registrationData = await registrationResponse.json();

                  if (!registrationData.registered) {
                    throw new Error(registrationData.reason || 'Face samples could not be registered.');
                  }

                  // Store only model metadata, never raw registration photos or descriptors.
                  const registrationRef = doc(db, "faceRegistrations", registeringStudent.uid);
                  await setDoc(registrationRef, {
                    uid: registeringStudent.uid,
                    model: 'opencv-haar-lbp',
                    modelLabel: registeringStudent.uid,
                    sampleCount: registrationData.accepted,
                    createdAt: new Date().toISOString()
                  });

                  // Link the Firebase user to the LBP model label.
                  const studentRef = doc(db, "users", registeringStudent.uid);
                  await updateDoc(studentRef, {
                    faceModelLabel: registeringStudent.uid,
                    descriptors: []
                  });

                  // Reload backend label cache.
                  try {
                    await fetch(`${FACE_API_URL}/reload`, { method: 'POST' });
                  } catch (reloadErr) {
                    console.error("Failed to reload backend student cache:", reloadErr);
                  }

                  // Update local state.
                  setStudents(prev => prev.map(s => {
                    if (s.uid === registeringStudent.uid) {
                      return {
                        ...s,
                        descriptors: [],
                        faceModelLabel: registeringStudent.uid
                      };
                    }
                    return s;
                  }));

                  // Refresh admin users list.
                  await loadAllUsers();

                  alert(`Face registration successful for ${registeringStudent.name}!`);
                  closeRegisterFaceModal();
                } catch (err) {
                  console.error('[FaceReg Save] OVERALL FAILURE:', err);
                  setRegisterStatus(`Save failed: ${err.message || 'Unknown error'}.`);
                  alert(`Error saving face registration: ${err.message}.`);
                }
                return;
              }
            }
          }
        } else {
          setRegisterStatus('Face Detected');
        }

        // Draw bounding box
        ctx.strokeStyle = boxColor;
        ctx.lineWidth = 3;
        ctx.strokeRect(x, y, width, height);

        // Draw label background
        ctx.fillStyle = boxColor;
        ctx.font = '14px sans-serif';
        const textWidth = ctx.measureText(label).width;
        ctx.fillRect(x, y - 25, textWidth + 10, 25);

        // Draw label text
        ctx.fillStyle = '#ffffff';
        ctx.fillText(label, x + 5, y - 7);
      } else {
        // No face detected - Draw red alignment guide box in the center
        const guideWidth = Math.min(200, canvas.width * 0.45);
        const guideHeight = Math.min(240, canvas.height * 0.65);
        const guideX = (canvas.width - guideWidth) / 2;
        const guideY = (canvas.height - guideHeight) / 2;

        ctx.strokeStyle = 'rgba(239, 68, 68, 1)';
        ctx.lineWidth = 3;
        ctx.strokeRect(guideX, guideY, guideWidth, guideHeight);

        // Draw label background
        ctx.fillStyle = 'rgba(239, 68, 68, 1)';
        ctx.font = '14px sans-serif';
        const label = 'Align Face in Box';
        const textWidth = ctx.measureText(label).width;
        ctx.fillRect(guideX, guideY - 25, textWidth + 10, 25);

        // Draw label text
        ctx.fillStyle = '#ffffff';
        ctx.fillText(label, guideX + 5, guideY - 7);

        if (registerCapturingRef.current) {
          setRegisterStatus('No face detected. Align your face in the camera.');
        } else {
          setRegisterStatus('No face detected');
        }
      }
    }, 200);
  };

  // Auto-start video when registration modal is shown
  useEffect(() => {
    if (isRegisteringFace && registeringStudent) {
      const timer = setTimeout(() => {
        startRegisterVideo();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isRegisteringFace, registeringStudent]);

  const simulateFacialRecognition = () => {
    // Start actual facial recognition process
    startFacialRecognition();
  };

  const getStudentAttendanceStats = (studentId) => {
    const attendance = attendanceData[studentId] || [];
    const totalDays = attendance.length;
    const presentDays = attendance.filter(a => a.status === 'present').length;
    const absentDays = totalDays - presentDays;
    const attendancePercentage = totalDays > 0 ? (presentDays / totalDays) * 100 : 0;
    
    return { totalDays, presentDays, absentDays, attendancePercentage };
  };

  const renderLogin = () => (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-lg shadow-md">
        <div>
          <div className="flex justify-center items-center">
            <img
              src="AutoMark-logo__.png"
              alt="Logo"
              className="object-contain"
              style={{ width: "5cm", height: "5cm" }}
            />
          </div>
          <p className="mt-2 text-center text-sm text-gray-600">
            Sign in to access your dashboard
          </p>
        </div>
        <div className="mt-8 space-y-6">
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="role" className="block text-sm font-medium text-gray-700 mb-1">Login as</label>
              <select
                id="role"
                value={loginData.role}
                onChange={(e) => setLoginData({...loginData, role: e.target.value})}
                className="relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
              >
                <option value="teacher">Teacher</option>
                <option value="student">Student</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="mt-4">
              <label htmlFor="username" className="sr-only">Username</label>
              <input
                id="username"
                type="text"
                required
                value={loginData.username}
                onChange={(e) => setLoginData({...loginData, username: e.target.value})}
                className="relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Username"
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">Password</label>
              <input
                id="password"
                type="password"
                required
                value={loginData.password}
                onChange={(e) => setLoginData({...loginData, password: e.target.value})}
                className="relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Password"
              />
            </div>
          </div>

          <div>
            <button
              onClick={handleLogin}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Sign in
            </button>
          </div>

          <div className="pt-4 border-t border-gray-100 flex flex-col items-center">
            <button
              onClick={handleSeedDatabase}
              disabled={seeding}
              className="text-xs text-indigo-600 hover:text-indigo-800 disabled:opacity-50 transition"
            >
              {seeding ? "Seeding Database..." : "Seed / Reset Demo Database"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderTeacherDashboard = () => (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-xl font-semibold text-gray-900">Teacher Dashboard - Class {user?.class}</h1>
          <div className="flex items-center space-x-4">
            <span className="text-gray-700">{user?.name}</span>
            <button onClick={handleLogout} className="text-gray-500 hover:text-gray-700">
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-medium text-gray-900">Mark Attendance</h2>
            <div className="flex items-center text-sm text-gray-500">
              <MapPin size={16} className="mr-1" />
              {geoLocation ? (
                isWithinSchoolPremises() ? (
                  <span className="text-green-600">Within school premises</span>
                ) : (
                  <span className="text-red-600">Outside school premises</span>
                )
              ) : (
                <span>Checking location...</span>
              )}
            </div>
          </div>
          
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {!cameraActive ? (
              <button
                onClick={startFacialRecognition}
                className="relative block w-full rounded-lg border-2 border-dashed border-gray-300 p-12 text-center hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
              >
                <Camera className="mx-auto h-12 w-12 text-gray-400" />
                <span className="mt-2 block text-sm font-medium text-gray-900">Start Facial Recognition</span>
              </button>
            ) : (
              <div className="relative block w-full rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  onPlay={handleVideoOnPlay}
                  className="w-full h-48 bg-gray-200 rounded-md"
                />
                <p className="mt-4 text-sm text-gray-600">Scanning faces...</p>
                {lastMarkedStatus && (
                  <p className="mt-2 text-sm text-green-600 font-semibold bg-green-50 py-1 px-2 rounded-md inline-block">
                    {lastMarkedStatus}
                  </p>
                )}
                <div className="mt-4 flex justify-center gap-2">
                  <button
                    onClick={simulateFacialRecognition}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                    Simulate Recognition
                  </button>
                  <button
                    onClick={stopFacialRecognition}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                  >
                    Stop Scanner
                  </button>
                </div>
              </div>
            )}
            
            {students.map(student => {
              const stats = getStudentAttendanceStats(student.id);
              return (
                <div key={student.id} className="bg-white overflow-hidden shadow rounded-lg">
                  <div className="px-4 py-5 sm:p-6">
                    <div className="flex items-center">
                      <img className="h-12 w-12 rounded-full" src={student.photo || DEFAULT_PROFILE_IMAGE} alt={`Profile of ${student.name}`} />
                      <div className="ml-4">
                        <h3 className="text-lg leading-6 font-medium text-gray-900">{student.name}</h3>
                        <p className="text-sm text-gray-500">Roll No: {student.rollNo}</p>
                      </div>
                    </div>
                    <div className="mt-4 flex justify-between">
                      <button
                        onClick={() => markAttendance(student.id, 'present')}
                        className="inline-flex items-center px-3 py-1 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                      >
                        Present
                      </button>
                      <button
                        onClick={() => markAttendance(student.id, 'absent')}
                        className="inline-flex items-center px-3 py-1 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                      >
                        Absent
                      </button>
                    </div>
                    <div className="mt-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">Attendance</span>
                        <span className="text-xs font-medium text-gray-900">{Math.round(stats.attendancePercentage)}%</span>
                      </div>
                      <div className="mt-1 w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-green-600 h-2 rounded-full"
                          style={{ width: `${stats.attendancePercentage}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <h2 className="text-lg font-medium text-gray-900">Today's Attendance</h2>
          <div className="mt-4 bg-white shadow overflow-hidden rounded-md">
            <ul className="divide-y divide-gray-200">
              {students.map(student => {
                const today = new Date().toISOString().split('T')[0];
                const todayAttendance = (attendanceData[student.id] || []).find(a => a.date === today);
                
                return (
                  <li key={student.id} className="px-6 py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <img className="h-10 w-10 rounded-full" src={student.photo || DEFAULT_PROFILE_IMAGE} alt={`Profile of ${student.name}`} />
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">{student.name}</div>
                          <div className="text-sm text-gray-500">Roll No: {student.rollNo}</div>
                        </div>
                      </div>
                      <div>
                        {todayAttendance ? (
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${todayAttendance.status === 'present' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            {todayAttendance.status === 'present' ? `Present at ${todayAttendance.timestamp}` : 'Absent'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                            Not marked
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <div className="mt-8">
          <h2 className="text-lg font-medium text-gray-900">Leave Applications</h2>
          <div className="mt-4 bg-white shadow overflow-hidden rounded-md">
            <ul className="divide-y divide-gray-200">
              {Object.entries(leaveApplications).map(([studentId, leaves]) => {
                const student = students.find(s => s.id === studentId);
                if (!student || !student.class.includes('5')) return null;
                return leaves.map((leave, index) => (
                  <li key={`${studentId}-${leave.id || index}`} className="px-6 py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <img className="h-10 w-10 rounded-full" src={student.photo || DEFAULT_PROFILE_IMAGE} alt={`Profile of ${student.name}`} />
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">{student.name}</div>
                          <div className="text-sm text-gray-500">Date: {leave.date}</div>
                          <div className="text-sm text-gray-500">Reason: {leave.reason}</div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          leave.status === 'approved' ? 'bg-green-100 text-green-800' :
                          leave.status === 'rejected' ? 'bg-red-100 text-red-800' :
                          'bg-yellow-100 text-yellow-800'
                        }`}>
                          {leave.status === 'approved' ? 'Approved' :
                           leave.status === 'rejected' ? 'Rejected' :
                           'Pending'}
                        </span>
                        {leave.status === 'pending' && (
                          <>
                            <button
                              onClick={async () => {
                                try {
                                  await updateDoc(doc(db, "leaveRequests", leave.id), { status: 'approved' });
                                  setLeaveApplications(prev => ({
                                    ...prev,
                                    [studentId]: prev[studentId].map(l => l.id === leave.id ? { ...l, status: 'approved' } : l)
                                  }));
                                  alert("Leave request approved successfully.");
                                } catch (error) {
                                  console.error('Error approving leave:', error);
                                  alert('Failed to approve leave');
                                }
                              }}
                              className="inline-flex items-center px-3 py-1 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-green-600 hover:bg-green-700"
                            >
                              Approve
                            </button>
                            <button
                              onClick={async () => {
                                try {
                                  await updateDoc(doc(db, "leaveRequests", leave.id), { status: 'rejected' });
                                  setLeaveApplications(prev => ({
                                    ...prev,
                                    [studentId]: prev[studentId].map(l => l.id === leave.id ? { ...l, status: 'rejected' } : l)
                                  }));
                                  alert("Leave request rejected successfully.");
                                } catch (error) {
                                  console.error('Error rejecting leave:', error);
                                  alert('Failed to reject leave');
                                }
                              }}
                              className="inline-flex items-center px-3 py-1 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-red-600 hover:bg-red-700"
                            >
                              Reject
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </li>
                ));
              })}
            </ul>
          </div>
        </div>
      </main>
    </div>
  );

  const renderStudentDashboard = () => {
    const stats = getStudentAttendanceStats(user?.id);
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
            <h1 className="text-xl font-semibold text-gray-900">Student Dashboard</h1>
            <div className="flex items-center space-x-4">
              <span className="text-gray-700">{user?.name}</span>
              <button onClick={handleLogout} className="text-gray-500 hover:text-gray-700">
                <LogOut size={20} />
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-white overflow-hidden shadow rounded-lg mb-8">
            <div className="px-4 py-5 sm:p-6">
              <div className="flex items-center">
                <img className="h-16 w-16 rounded-full" src={user?.photo || DEFAULT_PROFILE_IMAGE} alt="Profile of student" />
                <div className="ml-4">
                  <h3 className="text-lg leading-6 font-medium text-gray-900">{user?.name}</h3>
                  <p className="text-sm text-gray-500">Roll No: {user?.rollNo || user?.id} | Class: {user?.class}</p>
                </div>
              </div>
              {/* Leave Application Section */}
              <div className="mt-6">
                <h4 className="text-md font-semibold text-gray-900 mb-2">Apply for Leave</h4>
                <input
                  type="date"
                  min={new Date().toISOString().split('T')[0]}
                  value={selectedDate.toISOString().split('T')[0]}
                  onChange={(e) => setSelectedDate(new Date(e.target.value))}
                  className="border border-gray-300 rounded-md px-3 py-2 mb-2"
                />
                <textarea
                  placeholder="Reason for leave"
                  value={leaveReason}
                  onChange={(e) => setLeaveReason(e.target.value)}
                  className="border border-gray-300 rounded-md px-3 py-2 w-full mb-2"
                  rows="3"
                />
                <button
                  onClick={async () => {
                    const dayOfWeek = selectedDate.getDay();
                    if (dayOfWeek === 0 || dayOfWeek === 6) {
                      alert('Leave cannot be applied for weekends (Saturday/Sunday)');
                      return;
                    }

                    const dateStr = selectedDate.toISOString().split('T')[0];
                    if (holidays.includes(dateStr)) {
                      alert('Leave cannot be applied for holidays');
                      return;
                    }

                    if (!leaveReason.trim()) {
                      alert('Please provide a reason for the leave');
                      return;
                    }

                    try {
                      const docRef = await addDoc(collection(db, "leaveRequests"), {
                        studentId: user.id,
                        date: dateStr,
                        reason: leaveReason,
                        status: 'pending',
                        createdAt: new Date().toISOString()
                      });

                      setLeaveApplications(prev => ({
                        ...prev,
                        [user.id]: [...(prev[user.id] || []), { id: docRef.id, studentId: user.id, date: dateStr, reason: leaveReason, status: 'pending' }]
                      }));
                      setLeaveReason(''); // Clear the reason input
                      alert("Leave application submitted successfully.");
                    } catch (error) {
                      console.error('Error applying leave:', error);
                      alert('Failed to apply leave. Please try again.');
                    }
                  }}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-yellow-500 hover:bg-yellow-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-400"
                >
                  Apply Leave
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3 mb-8">
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0 bg-indigo-500 rounded-md p-3">
                    <Calendar className="h-6 w-6 text-white" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Total Days</dt>
                      <dd className="flex items-baseline">
                        <div className="text-2xl font-semibold text-gray-900">{stats.totalDays}</div>
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0 bg-green-500 rounded-md p-3">
                    <User className="h-6 w-6 text-white" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Present Days</dt>
                      <dd className="flex items-baseline">
                        <div className="text-2xl font-semibold text-gray-900">{stats.presentDays}</div>
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0 bg-red-500 rounded-md p-3">
                    <BarChart3 className="h-6 w-6 text-white" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Attendance %</dt>
                      <dd className="flex items-baseline">
                        <div className="text-2xl font-semibold text-gray-900">{Math.round(stats.attendancePercentage)}%</div>
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white shadow overflow-hidden rounded-md">
            <div className="px-4 py-5 sm:px-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900">Attendance History</h3>
              <p className="mt-1 max-w-2xl text-sm text-gray-500">Your attendance record for this month</p>
            </div>
            <div className="border-t border-gray-200">
              <ul className="divide-y divide-gray-200">
                {attendanceData[user?.id]?.map((record, index) => {
                  const leaveStatus = leaveApplications[user?.id]?.find(leave => leave.date === record.date);
                  return (
                    <li key={index} className="px-6 py-4">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-medium text-gray-900">{record.date}</div>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          leaveStatus ? (
                            leaveStatus.status === 'approved' ? 'bg-green-100 text-green-800' :
                            leaveStatus.status === 'rejected' ? 'bg-red-100 text-red-800' :
                            'bg-yellow-100 text-yellow-800'
                          ) : record.status === 'present' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {leaveStatus ? (
                            leaveStatus.status === 'approved' ? 'Leave Approved' :
                            leaveStatus.status === 'rejected' ? 'Leave Rejected' :
                            'Leave Pending'
                          ) : record.status === 'present' ? `Present at ${record.timestamp}` : 'Absent'}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </main>
      </div>
    );
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!createUserForm.email || !createUserForm.name) {
      alert("Please fill in email and name.");
      return;
    }
    
    // Auto-generate a temporary password
    const tempPassword = Math.random().toString(36).slice(-8) + "A1!";
    
    try {
      // 1. Create Firebase Auth account on the secondaryAuth instance
      const credential = await createUserWithEmailAndPassword(secondaryAuth, createUserForm.email, tempPassword);
      const newUser = credential.user;
      
      // 2. Sign out of secondary auth immediately
      await signOut(secondaryAuth);
      
      // 3. Write user profile to Firestore
      const userProfile = {
        uid: newUser.uid,
        email: createUserForm.email,
        name: createUserForm.name,
        role: createUserForm.role,
        class: createUserForm.class || '',
        rollNo: createUserForm.role === 'student' ? (createUserForm.rollNo || '') : '',
        department: createUserForm.department || '',
        studentId: newUser.uid, // Use Firebase UID as the studentId
        photo: '',
        disabled: false,
        deleted: false,
        createdAt: new Date().toISOString()
      };
      
      await setDoc(doc(db, "users", newUser.uid), userProfile);
      
      // Update credential state to show display window to the Admin
      setCreatedCredentials({
        email: createUserForm.email,
        password: tempPassword,
        name: createUserForm.name
      });
      
      // Reset creation form
      setCreateUserForm({ email: '', name: '', role: 'student', class: '', rollNo: '', department: '' });
      
      // Refresh directory listings
      await loadAllUsers();
      
      // Refresh student listings in case they are a student
      if (createUserForm.role === 'student') {
        const q = query(collection(db, "users"), where("role", "==", "student"));
        const querySnapshot = await getDocs(q);
        const studentList = [];
        querySnapshot.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.deleted !== true) {
            studentList.push({
              id: data.studentId || docSnap.id,
              docId: docSnap.id,
              ...data
            });
          }
        });
        studentList.sort((a, b) => (a.id || "").localeCompare(b.id || ""));
        setStudents(studentList);
      }
      
      alert("Account created successfully!");
    } catch (err) {
      console.error("Error creating user:", err);
      alert(`Failed to create account: ${err.message}`);
    }
  };

  const handleUpdateUser = async (e) => {
    if (e) e.preventDefault();
    if (!editUserForm || !editUserForm.name) {
      alert("Name is required.");
      return;
    }
    
    try {
      const userRef = doc(db, "users", editUserForm.uid);
      const updateData = {
        name: editUserForm.name,
        class: editUserForm.class || '',
        rollNo: editUserForm.role === 'student' ? (editUserForm.rollNo || '') : '',
        department: editUserForm.department || '',
        disabled: editUserForm.disabled
      };
      
      await updateDoc(userRef, updateData);
      
      setEditUserForm(null);
      await loadAllUsers();
      
      // Refresh students
      const q = query(collection(db, "users"), where("role", "==", "student"));
      const querySnapshot = await getDocs(q);
      const studentList = [];
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.deleted !== true) {
          studentList.push({
            id: data.studentId || docSnap.id,
            docId: docSnap.id,
            ...data
          });
        }
      });
      studentList.sort((a, b) => (a.id || "").localeCompare(b.id || ""));
      setStudents(studentList);
      
      alert("User updated successfully!");
    } catch (err) {
      console.error("Error updating user:", err);
      alert(`Failed to update user: ${err.message}`);
    }
  };

  const handleSoftDeleteUser = async (uid) => {
    if (!window.confirm("Are you sure you want to delete (deactivate) this user?")) {
      return;
    }
    try {
      const userRef = doc(db, "users", uid);
      await updateDoc(userRef, {
        disabled: true,
        deleted: true
      });
      
      await loadAllUsers();
      
      // Refresh students
      const q = query(collection(db, "users"), where("role", "==", "student"));
      const querySnapshot = await getDocs(q);
      const studentList = [];
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.deleted !== true) {
          studentList.push({
            id: data.studentId || docSnap.id,
            docId: docSnap.id,
            ...data
          });
        }
      });
      studentList.sort((a, b) => (a.id || "").localeCompare(b.id || ""));
      setStudents(studentList);
      
      alert("User account deleted (deactivated) successfully.");
    } catch (err) {
      console.error("Error deleting user:", err);
      alert(`Failed to delete user: ${err.message}`);
    }
  };

  const handleResetPassword = async (email) => {
    if (!window.confirm(`Send password reset email to ${email}?`)) {
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      alert(`Password reset email has been sent successfully to ${email}.`);
    } catch (err) {
      console.error("Error sending password reset email:", err);
      alert(`Failed to send password reset email: ${err.message}`);
    }
  };

  const getAdminStats = () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const totalStudents = students.length;
    let presentToday = 0;
    let absentToday = 0;

    students.forEach(student => {
      const records = attendanceData[student.id] || [];
      const todayRecord = records.find(r => r.date === todayStr);
      if (todayRecord) {
        if (todayRecord.status === 'present') {
          presentToday++;
        } else if (todayRecord.status === 'absent') {
          absentToday++;
        }
      }
    });

    let totalPresentDays = 0;
    let totalRecordsCount = 0;
    Object.values(attendanceData).forEach(records => {
      totalRecordsCount += records.length;
      totalPresentDays += records.filter(r => r.status === 'present').length;
    });
    const overallPercentage = totalRecordsCount > 0 ? (totalPresentDays / totalRecordsCount) * 100 : 0;

    return { totalStudents, presentToday, absentToday, overallPercentage };
  };

  const getClassStats = () => {
    const classMap = {};
    students.forEach(student => {
      const cls = student.class || 'Other';
      if (!classMap[cls]) {
        classMap[cls] = { totalPresent: 0, totalRecords: 0 };
      }
      const records = attendanceData[student.id] || [];
      classMap[cls].totalRecords += records.length;
      classMap[cls].totalPresent += records.filter(r => r.status === 'present').length;
    });

    const result = [];
    Object.entries(classMap).forEach(([className, data]) => {
      const percentage = data.totalRecords > 0 ? (data.totalPresent / data.totalRecords) * 100 : 0;
      result.push({ className, percentage: Math.round(percentage) });
    });
    return result;
  };

  const renderAdminDashboard = () => {
    const adminStats = getAdminStats();
    const classStats = getClassStats();

    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
            <h1 className="text-xl font-semibold text-gray-900">Admin Dashboard</h1>
            <div className="flex items-center space-x-4">
              <span className="text-gray-700">{user?.name}</span>
              <button onClick={handleLogout} className="text-gray-500 hover:text-gray-700">
                <LogOut size={20} />
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-6 border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              <button
                id="admin-tab-overview"
                onClick={() => setAdminView('overview')}
                className={`pb-4 px-1 border-b-2 font-medium text-sm transition ${
                  adminView === 'overview'
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                School Overview
              </button>
              <button
                id="admin-tab-users"
                onClick={() => {
                  setAdminView('users');
                  loadAllUsers();
                }}
                className={`pb-4 px-1 border-b-2 font-medium text-sm transition ${
                  adminView === 'users'
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                User Management
              </button>
            </nav>
          </div>

          {adminView === 'overview' ? (
            <>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-8">
                <div className="bg-white overflow-hidden shadow rounded-lg">
                  <div className="px-4 py-5 sm:p-6">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 bg-indigo-500 rounded-md p-3">
                        <User className="h-6 w-6 text-white" />
                      </div>
                      <div className="ml-5 w-0 flex-1">
                        <dl>
                          <dt className="text-sm font-medium text-gray-500 truncate">Total Students</dt>
                          <dd className="flex items-baseline">
                            <div className="text-2xl font-semibold text-gray-900">{adminStats.totalStudents}</div>
                          </dd>
                        </dl>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white overflow-hidden shadow rounded-lg">
                  <div className="px-4 py-5 sm:p-6">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 bg-green-500 rounded-md p-3">
                        <User className="h-6 w-6 text-white" />
                      </div>
                      <div className="ml-5 w-0 flex-1">
                        <dl>
                          <dt className="text-sm font-medium text-gray-500 truncate">Present Today</dt>
                          <dd className="flex items-baseline">
                            <div className="text-2xl font-semibold text-gray-900">{adminStats.presentToday}</div>
                          </dd>
                        </dl>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white overflow-hidden shadow rounded-lg">
                  <div className="px-4 py-5 sm:p-6">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 bg-red-500 rounded-md p-3">
                        <User className="h-6 w-6 text-white" />
                      </div>
                      <div className="ml-5 w-0 flex-1">
                        <dl>
                          <dt className="text-sm font-medium text-gray-500 truncate">Absent Today</dt>
                          <dd className="flex items-baseline">
                            <div className="text-2xl font-semibold text-gray-900">{adminStats.absentToday}</div>
                          </dd>
                        </dl>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white overflow-hidden shadow rounded-lg">
                  <div className="px-4 py-5 sm:p-6">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 bg-blue-500 rounded-md p-3">
                        <BarChart3 className="h-6 w-6 text-white" />
                      </div>
                      <div className="ml-5 w-0 flex-1">
                        <dl>
                          <dt className="text-sm font-medium text-gray-500 truncate">Overall Attendance</dt>
                          <dd className="flex items-baseline">
                            <div className="text-2xl font-semibold text-gray-900">{Math.round(adminStats.overallPercentage)}%</div>
                          </dd>
                        </dl>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white shadow overflow-hidden rounded-md">
                <div className="px-4 py-5 sm:px-6">
                  <h3 className="text-lg leading-6 font-medium text-gray-900">School Overview</h3>
                  <p className="mt-1 max-w-2xl text-sm text-gray-500">Attendance statistics and reports</p>
                </div>
                <div className="border-t border-gray-200 px-6 py-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <h4 className="text-sm font-medium text-gray-500 mb-2">Class-wise Attendance</h4>
                      <ul className="divide-y divide-gray-200">
                        {classStats.map((item, index) => (
                          <li key={index} className="py-2">
                            <div className="flex items-center justify-between">
                              <div className="text-sm font-medium text-gray-900">Class {item.className}</div>
                              <span className="text-sm text-gray-500">{item.percentage}%</span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-gray-500 mb-2">Recent Notifications</h4>
                      <ul className="divide-y divide-gray-200">
                        <li className="py-2">
                          <div className="text-sm text-gray-900">SMS sent to parents of absent students</div>
                          <div className="text-xs text-gray-500">Today, 10:30 AM</div>
                        </li>
                        <li className="py-2">
                          <div className="text-sm text-gray-900">Monthly attendance report generated</div>
                          <div className="text-xs text-gray-500">Yesterday, 3:45 PM</div>
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Generated Account Credentials Info Board */}
              {createdCredentials && (
                <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-6 relative">
                  <button 
                    onClick={() => setCreatedCredentials(null)}
                    className="absolute top-4 right-4 text-green-600 hover:text-green-800 focus:outline-none"
                  >
                    <X size={18} />
                  </button>
                  <h4 className="text-lg font-medium text-green-800 mb-2">New Account Credentials Created!</h4>
                  <p className="text-sm text-green-700 mb-4 font-normal">
                    Please copy these temporary credentials. The password is generated automatically and only displayed once:
                  </p>
                  <div className="bg-white border border-green-100 rounded p-4 font-mono text-sm text-gray-800 max-w-md shadow-sm">
                    <div><strong>Name:</strong> {createdCredentials.name}</div>
                    <div><strong>Email:</strong> {createdCredentials.email}</div>
                    <div><strong>Temporary Password:</strong> <span className="text-indigo-600 font-bold">{createdCredentials.password}</span></div>
                  </div>
                </div>
              )}

              {/* User management directory columns */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Create Account Form */}
                <div className="bg-white shadow rounded-lg p-6 h-fit">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Create User Account</h3>
                  <form onSubmit={handleCreateUser} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                      <input
                        type="text"
                        required
                        value={createUserForm.name}
                        onChange={(e) => setCreateUserForm({ ...createUserForm, name: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        placeholder="John Doe"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                      <input
                        type="email"
                        required
                        value={createUserForm.email}
                        onChange={(e) => setCreateUserForm({ ...createUserForm, email: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        placeholder="john.doe@automark.com"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                      <select
                        value={createUserForm.role}
                        onChange={(e) => setCreateUserForm({ ...createUserForm, role: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      >
                        <option value="student">Student</option>
                        <option value="teacher">Teacher</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                      <input
                        type="text"
                        value={createUserForm.department}
                        onChange={(e) => setCreateUserForm({ ...createUserForm, department: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        placeholder="E.g. AIML, CSE, ECE"
                      />
                    </div>
                    {createUserForm.role === 'student' && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Class</label>
                          <input
                            type="text"
                            value={createUserForm.class}
                            onChange={(e) => setCreateUserForm({ ...createUserForm, class: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                            placeholder="E.g. AIML 5th A"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Roll Number</label>
                          <input
                            type="text"
                            value={createUserForm.rollNo}
                            onChange={(e) => setCreateUserForm({ ...createUserForm, rollNo: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                            placeholder="E.g. 2823392"
                          />
                        </div>
                      </>
                    )}
                    {createUserForm.role === 'teacher' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Assigned Class</label>
                        <input
                          type="text"
                          value={createUserForm.class}
                          onChange={(e) => setCreateUserForm({ ...createUserForm, class: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                          placeholder="E.g. 5A"
                        />
                      </div>
                    )}
                    <button
                      type="submit"
                      className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                    >
                      Create Account
                    </button>
                  </form>
                </div>

                {/* Directory Table */}
                <div className="bg-white shadow rounded-lg p-6 lg:col-span-2 overflow-x-auto h-fit">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">User Directory</h3>
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Class/Dept</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {usersList.map((usr) => (
                        <tr key={usr.uid} className={usr.disabled ? 'bg-gray-50 text-gray-400' : ''}>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">{usr.name}</div>
                            <div className="text-xs text-gray-500">{usr.email}</div>
                            {usr.rollNo && <div className="text-xs text-gray-400 font-normal">Roll: {usr.rollNo}</div>}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium uppercase ${
                              usr.role === 'admin' ? 'bg-purple-100 text-purple-800' :
                              usr.role === 'teacher' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                            }`}>
                              {usr.role}
                            </span>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                            <div>{usr.class || '-'}</div>
                            <div className="text-xs text-gray-400 font-normal">{usr.department || '-'}</div>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              usr.disabled ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                            }`}>
                              {usr.disabled ? 'Disabled' : 'Active'}
                            </span>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                            {usr.role === 'student' && (
                              <button
                                id={`register-face-btn-${usr.uid}`}
                                onClick={() => startRegisterFace(usr)}
                                className="text-green-600 hover:text-green-900 bg-none border-none p-0 cursor-pointer focus:outline-none"
                                title="Register student face via webcam"
                              >
                                Register Face
                              </button>
                            )}
                            <button
                              onClick={() => setEditUserForm({ ...usr })}
                              className="text-indigo-600 hover:text-indigo-900 bg-none border-none p-0 cursor-pointer focus:outline-none"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleResetPassword(usr.email)}
                              className="text-yellow-600 hover:text-yellow-900 bg-none border-none p-0 cursor-pointer focus:outline-none"
                              title="Send password reset email"
                            >
                              Reset PW
                            </button>
                            <button
                              onClick={() => handleSoftDeleteUser(usr.uid)}
                              className="text-red-600 hover:text-red-900 bg-none border-none p-0 cursor-pointer focus:outline-none"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                      {usersList.length === 0 && (
                        <tr>
                          <td colSpan="5" className="px-4 py-8 text-center text-gray-500 text-sm font-normal">
                            No users found in directory.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {editUserForm && (
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4 z-50">
              <div className="bg-white rounded-lg p-6 max-w-md w-full shadow-xl">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-medium text-gray-900">Edit User Profile</h3>
                  <button onClick={() => setEditUserForm(null)} className="text-gray-400 hover:text-gray-600 focus:outline-none">
                    <X size={20} />
                  </button>
                </div>
                <form onSubmit={handleUpdateUser} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input
                      type="text"
                      disabled
                      value={editUserForm.email}
                      className="w-full px-3 py-2 border border-gray-200 bg-gray-50 rounded-md text-gray-500 sm:text-sm cursor-not-allowed"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                    <input
                      type="text"
                      required
                      value={editUserForm.name}
                      onChange={(e) => setEditUserForm({ ...editUserForm, name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                    <input
                      type="text"
                      value={editUserForm.department || ''}
                      onChange={(e) => setEditUserForm({ ...editUserForm, department: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    />
                  </div>
                  {editUserForm.role === 'student' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Class</label>
                        <input
                          type="text"
                          value={editUserForm.class || ''}
                          onChange={(e) => setEditUserForm({ ...editUserForm, class: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Roll Number</label>
                        <input
                          type="text"
                          value={editUserForm.rollNo || ''}
                          onChange={(e) => setEditUserForm({ ...editUserForm, rollNo: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        />
                      </div>
                    </>
                  )}
                  {editUserForm.role === 'teacher' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Assigned Class</label>
                      <input
                        type="text"
                        value={editUserForm.class || ''}
                        onChange={(e) => setEditUserForm({ ...editUserForm, class: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      />
                    </div>
                  )}
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="edit-disabled"
                      checked={editUserForm.disabled || false}
                      onChange={(e) => setEditUserForm({ ...editUserForm, disabled: e.target.checked })}
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded cursor-pointer"
                    />
                    <label htmlFor="edit-disabled" className="ml-2 block text-sm text-gray-900 font-medium select-none cursor-pointer">
                      Disable Account
                    </label>
                  </div>
                  <div className="flex space-x-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setEditUserForm(null)}
                      className="flex-1 py-2 px-4 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="flex-1 py-2 px-4 border border-transparent rounded-md text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none"
                    >
                      Save Changes
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Register Face modal */}
          {isRegisteringFace && registeringStudent && (
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4 z-50">
              <div className="bg-white rounded-lg p-6 max-w-md w-full shadow-xl">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h3 className="text-lg font-medium text-gray-900">Register Student Face</h3>
                    <p className="text-sm text-gray-500">{registeringStudent.name} (Roll: {registeringStudent.rollNo || 'N/A'})</p>
                  </div>
                  <button onClick={closeRegisterFaceModal} className="text-gray-400 hover:text-gray-600 focus:outline-none">
                    <X size={20} />
                  </button>
                </div>
                
                <div className="space-y-4">
                  {/* Camera view */}
                  <div className="relative overflow-hidden bg-black rounded-lg w-full aspect-video flex items-center justify-center">
                    <video
                      ref={registerVideoRef}
                      autoPlay
                      muted
                      onPlay={handleRegisterVideoOnPlay}
                      className="w-full h-full object-cover animate-none"
                    />
                    <canvas
                      ref={registerCanvasRef}
                      className="absolute top-0 left-0 w-full h-full object-cover pointer-events-none"
                    />
                  </div>

                  {/* Progress Indicator */}
                  <div>
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>Capture Progress</span>
                      <span>{registerCaptureProgress} / 10 samples</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-green-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${(registerCaptureProgress / 10) * 100}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Status Bar */}
                  <div className="text-center py-2 px-3 bg-gray-50 rounded-md border border-gray-100 min-h-[40px] flex items-center justify-center">
                    <p className="text-sm font-medium text-gray-700">
                      {registerStatus || 'Ready to capture. Keep face in center.'}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex space-x-3">
                    <button
                      id="register-start-capture"
                      type="button"
                      onClick={() => {
                        registerCapturingRef.current = true;
                        setRegisterCapturing(true);
                      }}
                      disabled={registerCapturing || registerCaptureProgress >= 10}
                      className={`flex-1 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${
                        registerCapturing || registerCaptureProgress >= 10
                          ? 'bg-gray-400 cursor-not-allowed'
                          : 'bg-green-600 hover:bg-green-700'
                      } focus:outline-none`}
                    >
                      {registerCapturing ? 'Capturing...' : 'Start Capture'}
                    </button>
                    <button
                      id="register-cancel"
                      type="button"
                      onClick={closeRegisterFaceModal}
                      className="flex-1 py-2 px-4 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    );
  };

  if (!user) {
    return renderLogin();
  }

  switch (currentView) {
    case 'teacher-dashboard':
      return renderTeacherDashboard();
    case 'student-dashboard':
      return renderStudentDashboard();
    case 'admin-dashboard':
      return renderAdminDashboard();
    default:
      return renderLogin();
  }
};

export default AutomatedAttendanceSystem;
