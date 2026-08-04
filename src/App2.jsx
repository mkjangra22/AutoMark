import React, { useState, useEffect, useRef } from 'react';
import { Camera, User, Calendar, BarChart3, MapPin, Bell, LogOut, Menu, X, Key, ShieldCheck, Save, Upload, Edit3, Lock, CheckCircle2, AlertCircle, Eye, EyeOff, UserCheck, RefreshCw } from 'lucide-react';
import { ref, uploadString, getDownloadURL } from "firebase/storage";
import { db, auth, storage, firebaseConfig } from './firebase';
import { initializeApp, getApps } from "firebase/app";
import { 
  signInWithEmailAndPassword, 
  signOut, 
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
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
const REQUIRED_STABLE_RECOGNITIONS = 1;
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
  const [isMockingLocation, setIsMockingLocation] = useState(false);
  const [schoolLocation] = useState({ lat: 28.976635, lng: 77.032988 }); // School location (Sonipat, Haryana)
  const [adminView, setAdminView] = useState('overview');
  const [usersList, setUsersList] = useState([]);
  const [createUserForm, setCreateUserForm] = useState({ email: '', name: '', role: 'student', class: '', assignedClasses: [], rollNo: '', department: '' });
  const [editUserForm, setEditUserForm] = useState(null);
  const [createdCredentials, setCreatedCredentials] = useState(null);
  const [classesList, setClassesList] = useState([]);
  const [newClassForm, setNewClassForm] = useState({ name: '', department: '' });
  const [selectedTeacherClass, setSelectedTeacherClass] = useState('all');
  const [userDirectoryRoleFilter, setUserDirectoryRoleFilter] = useState('all'); // 'all' | 'student' | 'teacher' | 'admin'

  // Student Profile & Password Management State
  const [studentTab, setStudentTab] = useState('attendance'); // 'attendance' | 'profile' | 'security'
  const [profileForm, setProfileForm] = useState({ name: '', class: '', rollNo: '', department: '', photo: '' });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [profileMessage, setProfileMessage] = useState({ type: '', text: '' });
  const [passwordMessage, setPasswordMessage] = useState({ type: '', text: '' });
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  useEffect(() => {
    if (user) {
      setProfileForm({
        name: user.name || '',
        class: user.class || '',
        rollNo: user.rollNo || '',
        department: user.department || '',
        photo: user.photo || ''
      });
    }
  }, [user]);

  const handleUpdateProfile = async (e) => {
    if (e) e.preventDefault();
    if (!user) return;
    if (!profileForm.name.trim()) {
      setProfileMessage({ type: 'error', text: 'Full Name cannot be empty.' });
      return;
    }

    setIsUpdatingProfile(true);
    setProfileMessage({ type: '', text: '' });

    try {
      const userUid = user.uid || user.id;
      const userDocRef = doc(db, "users", userUid);

      const updatePayload = {
        name: profileForm.name.trim(),
        class: profileForm.class.trim(),
        rollNo: profileForm.rollNo.trim(),
        department: profileForm.department.trim(),
        photo: profileForm.photo
      };

      await updateDoc(userDocRef, updatePayload);

      // Update local user state
      setUser(prev => ({
        ...prev,
        ...updatePayload
      }));

      // Update in students list if loaded
      setStudents(prev => prev.map(s => (s.uid === userUid || s.id === userUid || s.docId === userUid) ? { ...s, ...updatePayload } : s));

      setProfileMessage({ type: 'success', text: 'Profile details updated successfully!' });
    } catch (error) {
      console.error("Error updating profile:", error);
      setProfileMessage({ type: 'error', text: `Failed to update profile: ${error.message}` });
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const handleProfilePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const rawDataUrl = event.target.result;
      const compressedDataUrl = await compressImageToBase64(rawDataUrl, 320, 240, 0.6);
      setProfileForm(prev => ({ ...prev, photo: compressedDataUrl }));
    };
    reader.readAsDataURL(file);
  };

  const handleChangePassword = async (e) => {
    if (e) e.preventDefault();
    setPasswordMessage({ type: '', text: '' });

    if (!passwordForm.currentPassword) {
      setPasswordMessage({ type: 'error', text: 'Please enter your current (or temporary) password.' });
      return;
    }
    if (!passwordForm.newPassword) {
      setPasswordMessage({ type: 'error', text: 'Please enter your new password.' });
      return;
    }
    if (passwordForm.newPassword.length < 6) {
      setPasswordMessage({ type: 'error', text: 'New password must be at least 6 characters long.' });
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'New password and confirmation do not match.' });
      return;
    }

    setIsChangingPassword(true);

    try {
      const currentUser = auth.currentUser;
      if (!currentUser || !currentUser.email) {
        throw new Error("No active authenticated session found. Please log in again.");
      }

      // Re-authenticate user with current/temp password
      const credential = EmailAuthProvider.credential(currentUser.email, passwordForm.currentPassword);
      await reauthenticateWithCredential(currentUser, credential);

      // Update password in Firebase Auth
      await updatePassword(currentUser, passwordForm.newPassword);

      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setPasswordMessage({ type: 'success', text: 'Your password has been changed successfully! Use your new password the next time you log in.' });
    } catch (error) {
      console.error("Error changing password:", error);
      let errorMsg = error.message;
      if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        errorMsg = 'Incorrect current/temporary password. Please verify and try again.';
      } else if (error.code === 'auth/weak-password') {
        errorMsg = 'Password is too weak. Please choose a stronger password.';
      }
      setPasswordMessage({ type: 'error', text: errorMsg });
    } finally {
      setIsChangingPassword(false);
    }
  };

  // Teacher Profile & Password Management State
  const [teacherTab, setTeacherTab] = useState('attendance'); // 'attendance' | 'profile' | 'security'
  const [teacherProfileForm, setTeacherProfileForm] = useState({ name: '', class: '', department: '', photo: '' });
  const [teacherPasswordForm, setTeacherPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [showTeacherCurrentPassword, setShowTeacherCurrentPassword] = useState(false);
  const [showTeacherNewPassword, setShowTeacherNewPassword] = useState(false);
  const [teacherProfileMessage, setTeacherProfileMessage] = useState({ type: '', text: '' });
  const [teacherPasswordMessage, setTeacherPasswordMessage] = useState({ type: '', text: '' });
  const [isUpdatingTeacherProfile, setIsUpdatingTeacherProfile] = useState(false);
  const [isChangingTeacherPassword, setIsChangingTeacherPassword] = useState(false);

  useEffect(() => {
    if (user) {
      setTeacherProfileForm({
        name: user.name || '',
        class: user.class || '',
        department: user.department || '',
        photo: user.photo || ''
      });
    }
  }, [user]);

  const handleUpdateTeacherProfile = async (e) => {
    if (e) e.preventDefault();
    if (!user) return;
    if (!teacherProfileForm.name.trim()) {
      setTeacherProfileMessage({ type: 'error', text: 'Full Name cannot be empty.' });
      return;
    }

    setIsUpdatingTeacherProfile(true);
    setTeacherProfileMessage({ type: '', text: '' });

    try {
      const userUid = user.uid || user.id;
      const userDocRef = doc(db, "users", userUid);

      const updatePayload = {
        name: teacherProfileForm.name.trim(),
        class: teacherProfileForm.class.trim(),
        department: teacherProfileForm.department.trim(),
        photo: teacherProfileForm.photo
      };

      await updateDoc(userDocRef, updatePayload);

      // Update local user state
      setUser(prev => ({
        ...prev,
        ...updatePayload
      }));

      setTeacherProfileMessage({ type: 'success', text: 'Teacher profile details updated successfully!' });
    } catch (error) {
      console.error("Error updating teacher profile:", error);
      setTeacherProfileMessage({ type: 'error', text: `Failed to update profile: ${error.message}` });
    } finally {
      setIsUpdatingTeacherProfile(false);
    }
  };

  const handleTeacherProfilePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const rawDataUrl = event.target.result;
      const compressedDataUrl = await compressImageToBase64(rawDataUrl, 320, 240, 0.6);
      setTeacherProfileForm(prev => ({ ...prev, photo: compressedDataUrl }));
    };
    reader.readAsDataURL(file);
  };

  const handleTeacherChangePassword = async (e) => {
    if (e) e.preventDefault();
    setTeacherPasswordMessage({ type: '', text: '' });

    if (!teacherPasswordForm.currentPassword) {
      setTeacherPasswordMessage({ type: 'error', text: 'Please enter your current (or temporary) password.' });
      return;
    }
    if (!teacherPasswordForm.newPassword) {
      setTeacherPasswordMessage({ type: 'error', text: 'Please enter your new password.' });
      return;
    }
    if (teacherPasswordForm.newPassword.length < 6) {
      setTeacherPasswordMessage({ type: 'error', text: 'New password must be at least 6 characters long.' });
      return;
    }
    if (teacherPasswordForm.newPassword !== teacherPasswordForm.confirmPassword) {
      setTeacherPasswordMessage({ type: 'error', text: 'New password and confirmation do not match.' });
      return;
    }

    setIsChangingTeacherPassword(true);

    try {
      const currentUser = auth.currentUser;
      if (!currentUser || !currentUser.email) {
        throw new Error("No active authenticated session found. Please log in again.");
      }

      // Re-authenticate teacher with current/temp password
      const credential = EmailAuthProvider.credential(currentUser.email, teacherPasswordForm.currentPassword);
      await reauthenticateWithCredential(currentUser, credential);

      // Update password in Firebase Auth
      await updatePassword(currentUser, teacherPasswordForm.newPassword);

      setTeacherPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setTeacherPasswordMessage({ type: 'success', text: 'Your password has been changed successfully! Use your new password the next time you log in.' });
    } catch (error) {
      console.error("Error changing teacher password:", error);
      let errorMsg = error.message;
      if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        errorMsg = 'Incorrect current/temporary password. Please verify and try again.';
      } else if (error.code === 'auth/weak-password') {
        errorMsg = 'Password is too weak. Please choose a stronger password.';
      }
      setTeacherPasswordMessage({ type: 'error', text: errorMsg });
    } finally {
      setIsChangingTeacherPassword(false);
    }
  };

  // Admin Profile & Password Management State
  const [adminProfileForm, setAdminProfileForm] = useState({ name: '', department: '', photo: '' });
  const [adminPasswordForm, setAdminPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [showAdminCurrentPassword, setShowAdminCurrentPassword] = useState(false);
  const [showAdminNewPassword, setShowAdminNewPassword] = useState(false);
  const [adminProfileMessage, setAdminProfileMessage] = useState({ type: '', text: '' });
  const [adminPasswordMessage, setAdminPasswordMessage] = useState({ type: '', text: '' });
  const [isUpdatingAdminProfile, setIsUpdatingAdminProfile] = useState(false);
  const [isChangingAdminPassword, setIsChangingAdminPassword] = useState(false);

  useEffect(() => {
    if (user) {
      setAdminProfileForm({
        name: user.name || '',
        department: user.department || '',
        photo: user.photo || ''
      });
    }
  }, [user]);

  const handleUpdateAdminProfile = async (e) => {
    if (e) e.preventDefault();
    if (!user) return;
    if (!adminProfileForm.name.trim()) {
      setAdminProfileMessage({ type: 'error', text: 'Full Name cannot be empty.' });
      return;
    }

    setIsUpdatingAdminProfile(true);
    setAdminProfileMessage({ type: '', text: '' });

    try {
      const userUid = user.uid || user.id;
      const userDocRef = doc(db, "users", userUid);

      const updatePayload = {
        name: adminProfileForm.name.trim(),
        department: adminProfileForm.department.trim(),
        photo: adminProfileForm.photo
      };

      await updateDoc(userDocRef, updatePayload);

      // Update local user state
      setUser(prev => ({
        ...prev,
        ...updatePayload
      }));

      setAdminProfileMessage({ type: 'success', text: 'Admin profile details updated successfully!' });
    } catch (error) {
      console.error("Error updating admin profile:", error);
      setAdminProfileMessage({ type: 'error', text: `Failed to update profile: ${error.message}` });
    } finally {
      setIsUpdatingAdminProfile(false);
    }
  };

  const handleAdminProfilePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const rawDataUrl = event.target.result;
      const compressedDataUrl = await compressImageToBase64(rawDataUrl, 320, 240, 0.6);
      setAdminProfileForm(prev => ({ ...prev, photo: compressedDataUrl }));
    };
    reader.readAsDataURL(file);
  };

  const handleAdminChangePassword = async (e) => {
    if (e) e.preventDefault();
    setAdminPasswordMessage({ type: '', text: '' });

    if (!adminPasswordForm.currentPassword) {
      setAdminPasswordMessage({ type: 'error', text: 'Please enter your current (or temporary) password.' });
      return;
    }
    if (!adminPasswordForm.newPassword) {
      setAdminPasswordMessage({ type: 'error', text: 'Please enter your new password.' });
      return;
    }
    if (adminPasswordForm.newPassword.length < 6) {
      setAdminPasswordMessage({ type: 'error', text: 'New password must be at least 6 characters long.' });
      return;
    }
    if (adminPasswordForm.newPassword !== adminPasswordForm.confirmPassword) {
      setAdminPasswordMessage({ type: 'error', text: 'New password and confirmation do not match.' });
      return;
    }

    setIsChangingAdminPassword(true);

    try {
      const currentUser = auth.currentUser;
      if (!currentUser || !currentUser.email) {
        throw new Error("No active authenticated session found. Please log in again.");
      }

      // Re-authenticate admin with current/temp password
      const credential = EmailAuthProvider.credential(currentUser.email, adminPasswordForm.currentPassword);
      await reauthenticateWithCredential(currentUser, credential);

      // Update password in Firebase Auth
      await updatePassword(currentUser, adminPasswordForm.newPassword);

      setAdminPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setAdminPasswordMessage({ type: 'success', text: 'Your admin password has been changed successfully! Use your new password the next time you log in.' });
    } catch (error) {
      console.error("Error changing admin password:", error);
      let errorMsg = error.message;
      if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        errorMsg = 'Incorrect current password. Please verify and try again.';
      } else if (error.code === 'auth/weak-password') {
        errorMsg = 'Password is too weak. Please choose a stronger password.';
      }
      setAdminPasswordMessage({ type: 'error', text: errorMsg });
    } finally {
      setIsChangingAdminPassword(false);
    }
  };

  // Facial recognition registration & continuous scanning states/refs
  const [registeringStudent, setRegisteringStudent] = useState(null);
  const [isRegisteringFace, setIsRegisteringFace] = useState(false);
  const [registerCaptureProgress, setRegisterCaptureProgress] = useState(0);
  const [registerCapturing, setRegisterCapturing] = useState(false);
  const [registerStatus, setRegisterStatus] = useState('');
  const [lastMarkedStatus, setLastMarkedStatus] = useState('');
  const [registerTab, setRegisterTab] = useState('webcam');
  const [uploadedPhotos, setUploadedPhotos] = useState([]);
  const registerVideoRef = useRef(null);
  const registerCanvasRef = useRef(null);
  const registerIntervalRef = useRef(null);
  const registerCapturingRef = useRef(false);
  const photosRef = useRef([]);
  const capturesCountRef = useRef(0);
  const lastCenterRef = useRef(null);
  const lastCaptureTimeRef = useRef(0);
  const videoIntervalRef = useRef(null);
  const uploadingIdsRef = useRef(new Set());
  const recognitionCandidateRef = useRef({ label: '', consecutive: 0 });
  const recognitionRequestInFlightRef = useRef(false);

  const holidays = ['2025-01-26', '2025-08-15', '2025-10-02']; // Example holidays



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

  const loadAllClasses = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, "classes"));
      const list = [];
      querySnapshot.forEach(docSnap => {
        const data = docSnap.data();
        list.push({ id: docSnap.id, ...data });
      });

      if (list.length === 0) {
        const defaultClasses = [
          { id: '5A', name: '5A', department: 'Primary' },
          { id: 'AIML 5th A', name: 'AIML 5th A', department: 'Computer Science' },
          { id: 'CSE 3B', name: 'CSE 3B', department: 'Computer Science' }
        ];
        for (const cls of defaultClasses) {
          await setDoc(doc(db, "classes", cls.id), {
            name: cls.name,
            department: cls.department,
            createdAt: new Date().toISOString()
          });
        }
        setClassesList(defaultClasses);
      } else {
        list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        setClassesList(list);
      }
    } catch (error) {
      console.error("Error loading classes from Firestore:", error);
    }
  };

  useEffect(() => {
    loadAllClasses();
  }, []);

  const handleCreateClass = async (e) => {
    if (e) e.preventDefault();
    if (!newClassForm.name.trim()) {
      alert("Please enter a Class Name.");
      return;
    }
    const classId = newClassForm.name.trim();
    try {
      await setDoc(doc(db, "classes", classId), {
        name: classId,
        department: newClassForm.department.trim(),
        createdAt: new Date().toISOString()
      });
      setNewClassForm({ name: '', department: '' });
      await loadAllClasses();
      alert(`Class "${classId}" created successfully!`);
    } catch (err) {
      console.error("Error creating class:", err);
      alert(`Failed to create class: ${err.message}`);
    }
  };

  const getTeacherAssignedClasses = (userData) => {
    if (!userData) return [];
    if (Array.isArray(userData.assignedClasses) && userData.assignedClasses.length > 0) {
      return userData.assignedClasses;
    }
    if (typeof userData.assignedClasses === 'string' && userData.assignedClasses.trim()) {
      return userData.assignedClasses.split(',').map(c => c.trim()).filter(Boolean);
    }
    if (userData.class && typeof userData.class === 'string' && userData.class.trim()) {
      return [userData.class.trim()];
    }
    return [];
  };

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

  const toggleMockLocation = () => {
    if (!isMockingLocation) {
      setIsMockingLocation(true);
      setGeoLocation(schoolLocation);
    } else {
      setIsMockingLocation(false);
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
            setGeoLocation(null);
          }
        );
      } else {
        setGeoLocation(null);
      }
    }
  };

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
            uid: firebaseUser.uid,
            docId: userDoc.id,
            class: userData.class || '',
            rollNo: userData.rollNo || '',
            department: userData.department || '',
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
    if (isMockingLocation) return true;
    if (!geoLocation) return false;
    const distance = calculateDistance(
      geoLocation.lat, geoLocation.lng,
      schoolLocation.lat, schoolLocation.lng
    );
    return distance <= 500; // Within 500 meters of school
  };

  const markAttendance = async (studentId, status, photoUrl = null, silent = false) => {
    if (!isWithinSchoolPremises()) {
      if (!silent) {
        alert('Attendance can only be marked within school premises. Click "Enable Mock Location" at the top right if you are testing outside school premises.');
      } else {
        setLastMarkedStatus('Outside school premises (Attendance not marked). Click "Enable Mock Location" to bypass for testing.');
      }
      return false;
    }

    const today = getLocalDateKey();
    const time = new Date().toTimeString().split(' ')[0].substring(0, 5);

    // Find student details flexibly matching id, docId, or uid
    const student = students.find(s => s.id === studentId || s.docId === studentId || s.uid === studentId);
    const resolvedId = student ? (student.id || student.docId || student.uid) : studentId;
    const resolvedUid = student ? (student.uid || student.docId || student.id) : studentId;
    const resolvedDocId = student ? student.docId : studentId;
    const studentName = student ? student.name : '';
    const studentRollNo = student ? (student.rollNo || '') : '';

    try {
      const attendanceRef = doc(db, "attendance", `${resolvedId}_${today}`);
      const attendanceRecord = {
        studentId: resolvedId,
        date: today,
        status,
        timestamp: status === 'present' ? time : null,
        photoUrl: photoUrl || null,
        uid: resolvedUid,
        docId: resolvedDocId,
        name: studentName,
        rollNo: studentRollNo
      };

      await setDoc(attendanceRef, attendanceRecord);

      // Update local state across all candidate keys
      setAttendanceData(prev => {
        const newRecord = { date: today, status, timestamp: status === 'present' ? time : null, photoUrl };
        const updated = { ...prev };
        const keysToUpdate = Array.from(new Set([studentId, resolvedId, resolvedUid, resolvedDocId].filter(Boolean)));
        
        keysToUpdate.forEach(k => {
          updated[k] = [
            ...(prev[k] || []).filter(record => record.date !== today),
            newRecord
          ];
        });
        return updated;
      });

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
          const uid = data.uid;
          const docId = data.docId;
          const rec = {
            date: data.date,
            status: data.status,
            timestamp: data.timestamp,
            photoUrl: data.photoUrl || null
          };
          [studentId, uid, docId].filter(Boolean).forEach(k => {
            if (!attendanceMap[k]) {
              attendanceMap[k] = [];
            }
            if (!attendanceMap[k].some(r => r.date === data.date)) {
              attendanceMap[k].push(rec);
            }
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
    if (!videoRef.current) return;
    const container = videoRef.current.parentNode;
    
    // Clear any existing interval
    if (videoIntervalRef.current) {
      clearInterval(videoIntervalRef.current);
      videoIntervalRef.current = null;
    }
    recognitionRequestInFlightRef.current = false;
    
    // Clear any existing canvas
    const existingCanvas = container.querySelector('canvas');
    if (existingCanvas) {
      existingCanvas.remove();
    }

    const canvas = document.createElement('canvas');
    canvas.style.position = 'absolute';
    canvas.style.top = '0px';
    canvas.style.left = '0px';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';
    canvas.className = 'pointer-events-none';
    container.appendChild(canvas);

    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;

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
            const studentDoc = students.find(s => s.docId === resData.label || s.uid === resData.label || s.id === resData.label);
            const studentClass = studentDoc ? studentDoc.class : (resData.class || '');
            const teacherClasses = getTeacherAssignedClasses(user);
            const isClassAssigned = user?.role !== 'teacher' || teacherClasses.length === 0 || teacherClasses.includes(studentClass);

            if (!isClassAssigned) {
              color = 'rgba(245, 158, 11, 1)'; // Orange warning
              labelText = `${resData.name} (Class ${studentClass || 'N/A'} - Not in your class)`;
            } else {
              const previous = recognitionCandidateRef.current;
              const consecutive = previous.label === resData.label ? previous.consecutive + 1 : 1;
              recognitionCandidateRef.current = { label: resData.label, consecutive };
              const stableMatch = consecutive >= REQUIRED_STABLE_RECOGNITIONS;

              // Check if attendance already marked PRESENT today
              const today = getLocalDateKey();
              const targetStudentId = studentDoc ? (studentDoc.id || studentDoc.docId || studentDoc.uid) : resData.label;

              const candidateKeys = Array.from(new Set([
                resData.label,
                targetStudentId,
                studentDoc?.docId,
                studentDoc?.uid,
                studentDoc?.id
              ].filter(Boolean)));

              const allStudentRecords = candidateKeys.flatMap(k => attendanceData[k] || []);
              const todayRecord = allStudentRecords.find(r => r.date === today);
              const alreadyPresent = todayRecord && todayRecord.status === 'present';

              if (alreadyPresent) {
                color = 'rgba(245, 158, 11, 1)'; // Orange for already present
                labelText = `${resData.name} (already present)`;
              } else if (!stableMatch) {
                color = 'rgba(245, 158, 11, 1)';
                labelText = `${resData.name} - confirming ${consecutive}/${REQUIRED_STABLE_RECOGNITIONS}`;
              } else {
                color = 'rgba(16, 185, 129, 1)'; // Green for recognized
                labelText = `${resData.name} (Roll: ${resData.rollNo || 'N/A'}, verified)`;
              
              // Proceed with marking attendance
              if (!uploadingIdsRef.current.has(targetStudentId)) {
                uploadingIdsRef.current.add(targetStudentId);

                const saveAttendancePhoto = async () => {
                  let photoUrlToSave = null;
                  let uploadSuccessful = false;

                  if (USE_FIREBASE_STORAGE) {
                    try {
                      const storageRef = ref(storage, `attendance_photos/${targetStudentId}_${Date.now()}.png`);
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
                    const saved = await markAttendance(targetStudentId, 'present', photoUrlToSave, true);
                    if (saved) {
                      const time = new Date().toTimeString().split(' ')[0].substring(0, 5);
                      setLastMarkedStatus(`Marked present: ${resData.name} (Roll: ${resData.rollNo || 'N/A'}) at ${time}`);
                    }
                  } catch (markErr) {
                    console.error('[Attendance Save] Failed to mark attendance in Firestore:', markErr);
                  } finally {
                    uploadingIdsRef.current.delete(targetStudentId);
                  }
                };

                saveAttendancePhoto();
              }
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
    }, 500);
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
    registerCapturingRef.current = false;
    photosRef.current = [];
    capturesCountRef.current = 0;
    lastCenterRef.current = null;
    lastCaptureTimeRef.current = 0;
    setRegisterStatus('Camera starting... Align face in target area.');
    setTimeout(() => {
      startRegisterVideo();
    }, 150);
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
    setUploadedPhotos([]);
    setRegisterTab('webcam');
  };

  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setRegisterStatus(`Reading ${files.length} photo(s)...`);
    const readPromises = files.map(file => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(event.target.result);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      });
    });

    Promise.all(readPromises).then(results => {
      const validResults = results.filter(Boolean);
      setUploadedPhotos(prev => [...prev, ...validResults]);
      setRegisterStatus(`${uploadedPhotos.length + validResults.length} photos ready for training.`);
    });
  };

  const removeUploadedPhoto = (index) => {
    setUploadedPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const submitUploadedPhotos = async () => {
    if (!registeringStudent || uploadedPhotos.length < 5) {
      alert('Please upload at least 5 clear face photos of the student.');
      return;
    }

    setRegisterStatus('Training face model with uploaded photos...');
    try {
      const registrationResponse = await fetch(`${FACE_API_URL}/register_faces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: registeringStudent.uid, images: uploadedPhotos })
      });
      if (!registrationResponse.ok) {
        throw new Error('Face registration service is unavailable.');
      }
      const registrationData = await registrationResponse.json();
      if (!registrationData.registered) {
        throw new Error(registrationData.reason || 'Uploaded face samples could not be registered.');
      }

      const registrationRef = doc(db, "faceRegistrations", registeringStudent.uid);
      await setDoc(registrationRef, {
        uid: registeringStudent.uid,
        model: 'opencv-haar-lbp',
        modelLabel: registeringStudent.uid,
        sampleCount: registrationData.accepted,
        createdAt: new Date().toISOString()
      });

      const studentRef = doc(db, "users", registeringStudent.uid);
      await updateDoc(studentRef, {
        faceModelLabel: registeringStudent.uid,
        descriptors: []
      });

      try {
        await fetch(`${FACE_API_URL}/reload`, { method: 'POST' });
      } catch (reloadErr) {
        console.error("Failed to reload backend student cache:", reloadErr);
      }

      setStudents(prev => prev.map(s => s.uid === registeringStudent.uid ? { ...s, faceModelLabel: registeringStudent.uid } : s));
      await loadAllUsers();

      alert(`Face registration successful for ${registeringStudent.name} with ${registrationData.accepted} samples!`);
      closeRegisterFaceModal();
    } catch (err) {
      console.error('[FaceReg Upload] Error:', err);
      setRegisterStatus(`Upload failed: ${err.message}`);
      alert(`Error saving face registration: ${err.message}`);
    }
  };

  const handleRegisterVideoOnPlay = () => {
    if (!registerVideoRef.current) return;

    const canvas = registerCanvasRef.current;
    if (!canvas) return;

    if (registerIntervalRef.current) {
      clearInterval(registerIntervalRef.current);
      registerIntervalRef.current = null;
    }

    registerIntervalRef.current = setInterval(async () => {
      if (!registerVideoRef.current || registerVideoRef.current.paused || registerVideoRef.current.ended) {
        clearInterval(registerIntervalRef.current);
        registerIntervalRef.current = null;
        return;
      }

      const videoW = registerVideoRef.current.videoWidth;
      const videoH = registerVideoRef.current.videoHeight;
      if (!videoW || !videoH) return; // wait for video metadata

      if (canvas.width !== videoW || canvas.height !== videoH) {
        canvas.width = videoW;
        canvas.height = videoH;
      }

      // Capture current video frame
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = videoW;
      tempCanvas.height = videoH;
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.drawImage(registerVideoRef.current, 0, 0, videoW, videoH);
      const photoDataUrl = tempCanvas.toDataURL('image/jpeg', 0.7);

      let detection = null;
      try {
        const response = await fetch(`${FACE_API_URL}/recognize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: photoDataUrl })
        });
        if (response.ok) {
          detection = await response.json();
        }
      } catch (detectErr) {
        // Backend request error - fallback handling
      }

      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      let x, y, width, height;
      let hasFaceBox = false;

      if (detection && detection.box) {
        hasFaceBox = true;
        x = detection.box.x;
        y = detection.box.y;
        width = detection.box.width;
        height = detection.box.height;
      } else {
        // Fallback target alignment box in the video center
        width = Math.min(220, Math.round(videoW * 0.45));
        height = Math.min(260, Math.round(videoH * 0.65));
        x = Math.round((videoW - width) / 2);
        y = Math.round((videoH - height) / 2);
      }

      let boxColor = hasFaceBox ? 'rgba(16, 185, 129, 1)' : 'rgba(99, 102, 241, 1)';
      let label = hasFaceBox ? 'Face Detected' : 'Align Face in Box';

      if (registerCapturingRef.current) {
        const currentCount = capturesCountRef.current;
        label = `Capturing Sample ${currentCount + 1}/10`;
        boxColor = 'rgba(16, 185, 129, 1)';

        const now = Date.now();
        // Capture a sample every 500ms when capturing mode is active
        if (now - lastCaptureTimeRef.current >= 500) {
          capturesCountRef.current = currentCount + 1;
          const newCount = capturesCountRef.current;
          lastCaptureTimeRef.current = now;
          photosRef.current.push(photoDataUrl);

          setRegisterCaptureProgress(newCount);
          setRegisterStatus(`Capturing Sample ${newCount}/10... Keep face steady`);

          if (newCount >= 10) {
            registerCapturingRef.current = false;
            setRegisterCapturing(false);
            if (registerIntervalRef.current) {
              clearInterval(registerIntervalRef.current);
              registerIntervalRef.current = null;
            }

            setRegisterStatus('Registering face model. Please wait...');

            try {
              const capturedPhotos = [...photosRef.current];
              console.log('[FaceReg Save] Registering LBP samples for student:', registeringStudent.uid, registeringStudent.name);

              let acceptedCount = capturedPhotos.length;
              let registrationData = null;

              try {
                const registrationResponse = await fetch(`${FACE_API_URL}/register_faces`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ student_id: registeringStudent.uid, images: capturedPhotos })
                });

                if (registrationResponse.ok) {
                  registrationData = await registrationResponse.json();
                  if (registrationData.accepted) {
                    acceptedCount = registrationData.accepted;
                  }
                }
              } catch (apiErr) {
                console.warn('[FaceReg] Backend register_faces endpoint call failed:', apiErr);
              }

              // Store registration metadata in Firestore
              const registrationRef = doc(db, "faceRegistrations", registeringStudent.uid);
              await setDoc(registrationRef, {
                uid: registeringStudent.uid,
                model: 'opencv-haar-lbp',
                modelLabel: registeringStudent.uid,
                sampleCount: acceptedCount,
                createdAt: new Date().toISOString()
              });

              // Link student user record
              const studentRef = doc(db, "users", registeringStudent.uid);
              await updateDoc(studentRef, {
                faceModelLabel: registeringStudent.uid,
                descriptors: []
              });

              // Reload backend student cache
              try {
                await fetch(`${FACE_API_URL}/reload`, { method: 'POST' });
              } catch (reloadErr) {
                console.error("Failed to reload backend student cache:", reloadErr);
              }

              // Update local students state
              setStudents(prev => prev.map(s => {
                if (s.uid === registeringStudent.uid) {
                  return { ...s, descriptors: [], faceModelLabel: registeringStudent.uid };
                }
                return s;
              }));

              await loadAllUsers();

              alert(`Face registration successful for ${registeringStudent.name} with ${acceptedCount} sample photos!`);
              closeRegisterFaceModal();
            } catch (err) {
              console.error('[FaceReg Save] Error:', err);
              setRegisterStatus(`Save failed: ${err.message}`);
              alert(`Error saving face registration: ${err.message}`);
            }
            return;
          }
        }
      } else {
        setRegisterStatus(hasFaceBox ? 'Face detected and aligned. Click Capture to begin sample collection.' : 'Align face in camera center.');
      }

      // Draw bounding guide box
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
    }, 250);
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

  const captureCurrentFrame = async () => {
    if (!videoRef.current || !cameraActive) return;
    try {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = videoRef.current.videoWidth || 640;
      tempCanvas.height = videoRef.current.videoHeight || 480;
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.drawImage(videoRef.current, 0, 0, tempCanvas.width, tempCanvas.height);
      const photoDataUrl = tempCanvas.toDataURL('image/jpeg', 0.6);

      const response = await fetch(`${FACE_API_URL}/recognize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: photoDataUrl })
      });
      if (response.ok) {
        const resData = await response.json();
        if (resData.match && resData.label) {
          const time = new Date().toTimeString().split(' ')[0].substring(0, 5);
          await markAttendance(resData.label, 'present', photoDataUrl, true);
          setLastMarkedStatus(`Captured & Marked present: ${resData.name} (Roll: ${resData.rollNo || 'N/A'}) at ${time}`);
          return;
        } else if (resData.reason) {
          setLastMarkedStatus(`Captured: ${resData.reason}`);
          return;
        }
      } else {
        setLastMarkedStatus('Capture failed: Recognition service error.');
        return;
      }
    } catch (err) {
      console.warn('Backend recognize failed during capture:', err);
      setLastMarkedStatus('Capture: Recognition backend offline. Face not recognized.');
      return;
    }
  };

  const simulateFacialRecognition = async () => {
    if (!videoRef.current || !cameraActive) {
      setLastMarkedStatus('Turn on camera to scan faces.');
      return;
    }
    setLastMarkedStatus('Scanning frame for registered face...');
    try {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = videoRef.current.videoWidth || 640;
      tempCanvas.height = videoRef.current.videoHeight || 480;
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.drawImage(videoRef.current, 0, 0, tempCanvas.width, tempCanvas.height);
      const photoDataUrl = tempCanvas.toDataURL('image/jpeg', 0.6);

      const response = await fetch(`${FACE_API_URL}/recognize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: photoDataUrl })
      });
      if (response.ok) {
        const resData = await response.json();
        if (resData.match && resData.label) {
          const time = new Date().toTimeString().split(' ')[0].substring(0, 5);
          await markAttendance(resData.label, 'present', photoDataUrl, true);
          setLastMarkedStatus(`Recognized & Marked present: ${resData.name} (Roll: ${resData.rollNo || 'N/A'}) at ${time}`);
        } else {
          setLastMarkedStatus(`Scan complete: ${resData.reason || 'No matching face recognized'}`);
        }
      } else {
        setLastMarkedStatus('Scan complete: Recognition server error.');
      }
    } catch (err) {
      setLastMarkedStatus('Scan complete: Recognition server unavailable.');
    }
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-slate-50 to-blue-50 py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Soft background ambient glows */}
      <div className="absolute top-1/4 -left-20 w-96 h-96 bg-indigo-300/20 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-blue-300/20 rounded-full blur-3xl pointer-events-none"></div>

      <div className="max-w-md w-full relative z-10">
        {/* Clean Light Card Container */}
        <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-200/80 space-y-7">
          
          {/* Header & Branding */}
          <div className="text-center">
            <div className="inline-flex p-3 bg-indigo-50/80 rounded-2xl mb-3 shadow-inner">
              <img
                src="AutoMark-logo__.png"
                alt="AutoMark Logo"
                className="w-36 h-16 object-contain"
              />
            </div>
            <h2 className="text-2xl font-black text-gray-900 tracking-tight">
              Welcome to AutoMark
            </h2>
            <p className="mt-1 text-xs text-gray-500 font-medium">
              {loginData.role === 'teacher' && 'Mark facial attendance & manage class records'}
              {loginData.role === 'student' && 'View attendance statistics & submit leave requests'}
              {loginData.role === 'admin' && 'Manage users, classes & system-wide metrics'}
            </p>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); handleLogin(); }} className="space-y-5">
            {/* Segmented Role Selector Bar */}
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2 text-center">
                Select Login Portal
              </label>
              
              <div className="grid grid-cols-3 gap-1.5 bg-slate-100 p-1.5 rounded-2xl border border-slate-200/80 shadow-inner">
                <button
                  type="button"
                  onClick={() => setLoginData({...loginData, role: 'teacher'})}
                  className={`flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    loginData.role === 'teacher'
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
                  }`}
                >
                  <UserCheck className="w-4 h-4" />
                  <span>Teacher</span>
                </button>

                <button
                  type="button"
                  onClick={() => setLoginData({...loginData, role: 'student'})}
                  className={`flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    loginData.role === 'student'
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
                  }`}
                >
                  <User className="w-4 h-4" />
                  <span>Student</span>
                </button>

                <button
                  type="button"
                  onClick={() => setLoginData({...loginData, role: 'admin'})}
                  className={`flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    loginData.role === 'admin'
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
                  }`}
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Admin</span>
                </button>
              </div>
            </div>

            {/* Inputs Group */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Username / Email
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    id="username"
                    type="text"
                    required
                    value={loginData.username}
                    onChange={(e) => setLoginData({...loginData, username: e.target.value})}
                    className="block w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all bg-gray-50/50 focus:bg-white"
                    placeholder={loginData.role === 'student' ? "Enter Roll No or Email" : "Enter Email or Username"}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    id="password"
                    type={showLoginPassword ? "text" : "password"}
                    required
                    value={loginData.password}
                    onChange={(e) => setLoginData({...loginData, password: e.target.value})}
                    className="block w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all bg-gray-50/50 focus:bg-white"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword(!showLoginPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-400 hover:text-gray-600 transition"
                  >
                    {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              className="w-full flex justify-center items-center gap-2 py-3 px-4 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 shadow-lg shadow-indigo-500/25 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all cursor-pointer active:scale-[0.99]"
            >
              <span>Sign In as {loginData.role.charAt(0).toUpperCase() + loginData.role.slice(1)}</span>
            </button>
          </form>

        </div>
      </div>
    </div>
  );

  const renderTeacherDashboard = () => {
    const assignedClasses = getTeacherAssignedClasses(user);

    const teacherStudents = students.filter(s => {
      if (assignedClasses.length === 0) return true;
      if (selectedTeacherClass !== 'all') {
        return s.class === selectedTeacherClass;
      }
      return assignedClasses.includes(s.class);
    });

    return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-indigo-600 selection:text-white">
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200/80 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center space-x-3">
            <img className="h-10 w-10 rounded-full object-cover border border-indigo-100 shadow-sm" src={user?.photo || DEFAULT_PROFILE_IMAGE} alt="Profile" />
            <div>
              <h1 className="text-xl font-bold text-slate-900 leading-tight">Teacher Portal</h1>
              <p className="text-xs text-slate-500">{user?.name} {assignedClasses.length > 0 ? `| Classes: ${assignedClasses.join(', ')}` : ''} {user?.department && `| ${user.department}`}</p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center space-x-1 sm:space-x-2 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
            <button
              onClick={() => setTeacherTab('attendance')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                teacherTab === 'attendance'
                  ? 'bg-white text-indigo-600 shadow-sm font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <UserCheck className="w-4 h-4" />
              <span>Dashboard</span>
            </button>

            <button
              onClick={() => setTeacherTab('profile')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                teacherTab === 'profile'
                  ? 'bg-white text-indigo-600 shadow-sm font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <User className="w-4 h-4" />
              <span>My Profile</span>
            </button>
          </div>

          <div className="flex items-center space-x-3">
            {assignedClasses.length > 1 && (
              <div className="flex items-center space-x-2 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
                <span className="text-xs font-semibold text-slate-500 uppercase">Filter:</span>
                <select
                  value={selectedTeacherClass}
                  onChange={(e) => setSelectedTeacherClass(e.target.value)}
                  className="text-xs font-semibold text-slate-800 bg-transparent focus:outline-none cursor-pointer"
                >
                  <option value="all">All ({assignedClasses.join(', ')})</option>
                  {assignedClasses.map(cls => (
                    <option key={cls} value={cls}>Class {cls}</option>
                  ))}
                </select>
              </div>
            )}

            <button 
              onClick={handleLogout} 
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 hover:text-red-600 transition cursor-pointer shadow-sm"
              title="Log Out"
            >
              <LogOut size={15} />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-grow w-full">
        {teacherTab === 'attendance' && (
          <div className="space-y-8">
            <div className="mb-8">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Mark Attendance</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Showing students assigned to your classes ({teacherStudents.length} student{teacherStudents.length !== 1 ? 's' : ''})</p>
                </div>
                <div className="flex items-center space-x-3 text-sm text-slate-500">
                  <div className="flex items-center">
                    <MapPin size={16} className="mr-1" />
                    {geoLocation || isMockingLocation ? (
                      isWithinSchoolPremises() ? (
                        <span className="text-emerald-600 font-semibold">Within school premises</span>
                      ) : (
                        <span className="text-red-600 font-semibold">Outside school premises</span>
                      )
                    ) : (
                      <span className="text-amber-600 font-semibold">Location unavailable</span>
                    )}
                  </div>
                  <button
                    onClick={toggleMockLocation}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      isMockingLocation
                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                        : 'bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100'
                    }`}
                  >
                    {isMockingLocation ? '✓ Mock Location Active (Bypassed)' : '⚡ Enable Mock Location'}
                  </button>
                </div>
              </div>

              {!isWithinSchoolPremises() && (
                <div className="mt-3 p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-sm text-amber-800">
                  <div className="flex items-center">
                    <AlertCircle size={18} className="mr-2 text-amber-600 shrink-0" />
                    <span>
                      <strong>Location Notice:</strong> You are detected outside school premises. Attendance marking is paused until location is verified or mock location is enabled.
                    </span>
                  </div>
                  <button
                    onClick={toggleMockLocation}
                    className="ml-4 text-xs bg-amber-600 hover:bg-amber-700 text-white font-bold px-3 py-1.5 rounded-lg transition cursor-pointer shrink-0 shadow-sm"
                  >
                    Enable Mock Location
                  </button>
                </div>
              )}
              
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {!cameraActive ? (
                  <div className="relative block w-full rounded-2xl border-2 border-dashed border-indigo-200 p-8 text-center bg-white flex flex-col items-center justify-center min-h-[220px] shadow-sm">
                    <Camera className="mx-auto h-10 w-10 text-indigo-600 mb-2" />
                    <p className="text-sm font-bold text-slate-900 mb-3">Facial Recognition Attendance</p>
                    <button
                      id="start-facial-rec-btn"
                      onClick={startFacialRecognition}
                      className="inline-flex items-center px-6 py-2.5 border border-transparent text-sm font-bold rounded-xl shadow-md shadow-indigo-600/20 text-white bg-indigo-600 hover:bg-indigo-700 transition-all cursor-pointer"
                    >
                      <Camera className="mr-2 h-4 w-4" />
                      Start Camera Scan
                    </button>
                  </div>
                ) : (
                  <div className="relative block w-full rounded-2xl border border-slate-200 p-6 text-center bg-white shadow-md">
                    <div className="relative overflow-hidden bg-slate-900 rounded-xl w-full h-48 flex items-center justify-center border border-slate-800">
                      <video
                        ref={videoRef}
                        autoPlay
                        muted
                        onPlay={handleVideoOnPlay}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <p className="mt-3 text-xs text-slate-500 font-medium">Camera Active & Scanning assigned class students...</p>
                    {lastMarkedStatus && (
                      <p className="mt-2 text-xs text-emerald-800 font-semibold bg-emerald-50 py-1.5 px-3 rounded-lg border border-emerald-200 inline-block">
                        {lastMarkedStatus}
                      </p>
                    )}
                    <div className="relative z-10 mt-4 flex justify-center">
                      <button
                        id="camera-close-btn"
                        type="button"
                        onClick={stopFacialRecognition}
                        className="inline-flex items-center px-5 py-2 border border-red-200 text-xs font-bold rounded-xl text-red-700 bg-red-50 hover:bg-red-100 transition-all cursor-pointer"
                      >
                        <X className="mr-1.5 h-4 w-4 text-red-600" />
                        Close Camera
                      </button>
                    </div>
                  </div>
                )}
                
                {teacherStudents.map(student => {
                  const stats = getStudentAttendanceStats(student.id);
                  return (
                    <div key={student.id} className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition">
                      <div className="px-4 py-5 sm:p-6">
                        <div className="flex items-center">
                          <img className="h-12 w-12 rounded-full object-cover border border-slate-200 shadow-sm" src={student.photo || DEFAULT_PROFILE_IMAGE} alt={`Profile of ${student.name}`} />
                          <div className="ml-4">
                            <h3 className="text-lg leading-6 font-bold text-slate-900">{student.name}</h3>
                            <p className="text-xs text-indigo-600 font-semibold">Class {student.class} | Roll: {student.rollNo || 'N/A'}</p>
                          </div>
                        </div>
                        <div className="mt-4 flex justify-between gap-2">
                          <button
                            onClick={() => markAttendance(student.id, 'present')}
                            className="flex-1 inline-flex justify-center items-center px-3 py-2 border border-emerald-200 text-xs font-bold rounded-xl text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition cursor-pointer"
                          >
                            Present
                          </button>
                          <button
                            onClick={() => markAttendance(student.id, 'absent')}
                            className="flex-1 inline-flex justify-center items-center px-3 py-2 border border-red-200 text-xs font-bold rounded-xl text-red-700 bg-red-50 hover:bg-red-100 transition cursor-pointer"
                          >
                            Absent
                          </button>
                        </div>
                        <div className="mt-4">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-500">Attendance</span>
                            <span className="text-xs font-bold text-slate-900">{Math.round(stats.attendancePercentage)}%</span>
                          </div>
                          <div className="mt-1 w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200">
                            <div
                              className="bg-emerald-600 h-2 rounded-full"
                              style={{ width: `${stats.attendancePercentage}%` }}
                            ></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {teacherStudents.length === 0 && (
                  <div className="col-span-full py-8 text-center bg-white rounded-lg border border-gray-200 text-gray-500 text-sm">
                    No students currently assigned to your class.
                  </div>
                )}
              </div>
            </div>

            <div>
              <h2 className="text-lg font-medium text-gray-900">Today's Attendance</h2>
              <div className="mt-4 bg-white shadow overflow-hidden rounded-md">
                <ul className="divide-y divide-gray-200">
                  {teacherStudents.map(student => {
                    const today = new Date().toISOString().split('T')[0];
                    const todayAttendance = (attendanceData[student.id] || []).find(a => a.date === today);
                    
                    return (
                      <li key={student.id} className="px-6 py-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center">
                            <img className="h-10 w-10 rounded-full object-cover border border-gray-200" src={student.photo || DEFAULT_PROFILE_IMAGE} alt={`Profile of ${student.name}`} />
                            <div className="ml-4">
                              <div className="text-sm font-medium text-gray-900">{student.name}</div>
                              <div className="text-xs text-gray-500">Class {student.class} | Roll: {student.rollNo || 'N/A'}</div>
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
                    const student = teacherStudents.find(s => s.id === studentId || s.docId === studentId);
                    if (!student) return null;
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
          </div>
        )}

        {teacherTab === 'profile' && (
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="bg-white shadow rounded-xl border border-gray-100 overflow-hidden">
              <div className="px-6 py-5 bg-gradient-to-r from-indigo-600 to-blue-700 text-white flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    <User className="w-6 h-6" />
                    Manage Teacher Profile
                  </h2>
                  <p className="text-xs text-indigo-100 mt-1">View and update your faculty details and profile picture</p>
                </div>
              </div>

              <div className="p-6 space-y-6">
                {teacherProfileMessage.text && (
                  <div className={`p-4 rounded-lg flex items-center gap-3 text-sm font-medium ${
                    teacherProfileMessage.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'
                  }`}>
                    {teacherProfileMessage.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />}
                    <span>{teacherProfileMessage.text}</span>
                  </div>
                )}

                {/* Profile Picture Banner */}
                <div className="flex flex-col sm:flex-row items-center gap-6 p-4 bg-gray-50 rounded-xl border border-gray-200">
                  <div className="relative group">
                    <img
                      src={teacherProfileForm.photo || user?.photo || DEFAULT_PROFILE_IMAGE}
                      alt="Profile Preview"
                      className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-md"
                    />
                    <label htmlFor="teacher-avatar-input" className="absolute bottom-0 right-0 bg-indigo-600 hover:bg-indigo-700 text-white p-2 rounded-full cursor-pointer shadow-lg transition-transform hover:scale-105">
                      <Upload className="w-4 h-4" />
                    </label>
                    <input
                      id="teacher-avatar-input"
                      type="file"
                      accept="image/*"
                      onChange={handleTeacherProfilePhotoUpload}
                      className="hidden"
                    />
                  </div>
                  <div className="text-center sm:text-left">
                    <h4 className="text-base font-semibold text-gray-900">Faculty Photo</h4>
                    <p className="text-xs text-gray-500 mt-1">Upload a official photo of yourself (JPEG/PNG). Recommended size under 2MB.</p>
                    <label htmlFor="teacher-avatar-input" className="inline-block mt-3 px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-100 cursor-pointer transition">
                      Choose New Picture
                    </label>
                  </div>
                </div>

                <form onSubmit={handleUpdateTeacherProfile} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Full Name</label>
                      <input
                        type="text"
                        value={teacherProfileForm.name}
                        onChange={(e) => setTeacherProfileForm({ ...teacherProfileForm, name: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        placeholder="Your full name"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Email Address</label>
                      <input
                        type="email"
                        value={user?.email || ''}
                        disabled
                        className="w-full px-3 py-2 border border-gray-200 bg-gray-100 text-gray-500 rounded-lg text-sm cursor-not-allowed"
                      />
                      <p className="text-[10px] text-gray-400 mt-1">Email is managed by Admin.</p>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Assigned Class / Grade</label>
                      <input
                        type="text"
                        value={teacherProfileForm.class}
                        onChange={(e) => setTeacherProfileForm({ ...teacherProfileForm, class: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        placeholder="e.g. 5"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Department / Subject</label>
                      <input
                        type="text"
                        value={teacherProfileForm.department}
                        onChange={(e) => setTeacherProfileForm({ ...teacherProfileForm, department: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        placeholder="e.g. Science / Mathematics"
                      />
                    </div>
                  </div>

                  <div className="pt-4 flex justify-end">
                    <button
                      type="submit"
                      disabled={isUpdatingTeacherProfile}
                      className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md transition ${
                        isUpdatingTeacherProfile ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'
                      }`}
                    >
                      {isUpdatingTeacherProfile ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Saving Changes...</span>
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4" />
                          <span>Save Profile Changes</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>

            {/* Security & Password Change Section */}
            <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-indigo-600" />
                  Account Security & Password
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Update your current or temporary password to a strong permanent password.
                </p>
              </div>

              <div className="p-6 space-y-6">
                {teacherPasswordMessage.text && (
                  <div className={`p-4 rounded-xl flex items-center gap-3 text-sm font-medium ${
                    teacherPasswordMessage.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'
                  }`}>
                    {teacherPasswordMessage.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />}
                    <span>{teacherPasswordMessage.text}</span>
                  </div>
                )}

                <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-xs leading-relaxed flex items-start gap-2.5">
                  <Key className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <strong className="font-semibold block mb-0.5">Security Guidelines:</strong>
                    Enter your current temporary password provided by Admin, then set a new password containing at least 6 characters.
                  </div>
                </div>

                <form onSubmit={handleTeacherChangePassword} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                      Current / Temporary Password
                    </label>
                    <div className="relative">
                      <input
                        type={showTeacherCurrentPassword ? "text" : "password"}
                        value={teacherPasswordForm.currentPassword}
                        onChange={(e) => setTeacherPasswordForm({ ...teacherPasswordForm, currentPassword: e.target.value })}
                        className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        placeholder="Enter current or temporary password"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowTeacherCurrentPassword(!showTeacherCurrentPassword)}
                        className="absolute right-3.5 top-3 text-slate-400 hover:text-slate-600"
                      >
                        {showTeacherCurrentPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                      New Password
                    </label>
                    <div className="relative">
                      <input
                        type={showTeacherNewPassword ? "text" : "password"}
                        value={teacherPasswordForm.newPassword}
                        onChange={(e) => setTeacherPasswordForm({ ...teacherPasswordForm, newPassword: e.target.value })}
                        className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        placeholder="Enter new password (min. 6 characters)"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowTeacherNewPassword(!showTeacherNewPassword)}
                        className="absolute right-3.5 top-3 text-slate-400 hover:text-slate-600"
                      >
                        {showTeacherNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                      Confirm New Password
                    </label>
                    <input
                      type="password"
                      value={teacherPasswordForm.confirmPassword}
                      onChange={(e) => setTeacherPasswordForm({ ...teacherPasswordForm, confirmPassword: e.target.value })}
                      className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="Re-enter new password"
                      required
                    />
                  </div>

                  <div className="pt-4 flex justify-end">
                    <button
                      type="submit"
                      disabled={isChangingTeacherPassword}
                      className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 shadow-md transition ${
                        isChangingTeacherPassword ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'
                      }`}
                    >
                      {isChangingTeacherPassword ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Updating Password...</span>
                        </>
                      ) : (
                        <>
                          <Key className="w-4 h-4" />
                          <span>Update Password</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

  const renderStudentDashboard = () => {
    const stats = getStudentAttendanceStats(user?.id);
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-indigo-600 selection:text-white">
        <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200/80 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center space-x-3">
              <img className="h-10 w-10 rounded-full object-cover border border-indigo-100 shadow-sm" src={user?.photo || DEFAULT_PROFILE_IMAGE} alt="Profile" />
              <div>
                <h1 className="text-xl font-bold text-slate-900 leading-tight">Student Portal</h1>
                <p className="text-xs text-slate-500">{user?.name} | {user?.email}</p>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex items-center space-x-1 sm:space-x-2 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
              <button
                onClick={() => setStudentTab('attendance')}
                className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  studentTab === 'attendance'
                    ? 'bg-white text-indigo-600 shadow-sm font-bold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                <BarChart3 className="w-4 h-4" />
                <span>Dashboard</span>
              </button>

              <button
                onClick={() => setStudentTab('profile')}
                className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  studentTab === 'profile'
                    ? 'bg-white text-indigo-600 shadow-sm font-bold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                <User className="w-4 h-4" />
                <span>My Profile</span>
              </button>
            </div>

            <div className="flex items-center">
              <button 
                onClick={handleLogout} 
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 hover:text-red-600 transition cursor-pointer shadow-sm"
                title="Log Out"
              >
                <LogOut size={15} />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-grow w-full">
          {studentTab === 'attendance' && (
            <div className="space-y-8">
              {/* Profile Card & Leave Application */}
              <div className="bg-white border border-slate-200/80 overflow-hidden shadow-sm rounded-2xl">
                <div className="px-6 py-6">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-6 border-b border-slate-100 gap-4">
                    <div className="flex items-center space-x-4">
                      <img className="h-16 w-16 rounded-full object-cover border-2 border-indigo-100 shadow-sm" src={user?.photo || DEFAULT_PROFILE_IMAGE} alt="Profile" />
                      <div>
                        <h3 className="text-xl font-bold text-slate-900">{user?.name}</h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Roll No: <span className="font-semibold text-slate-700">{user?.rollNo || user?.id}</span> | Class: <span className="font-semibold text-slate-700">{user?.class || 'N/A'}</span> {user?.department && `| Dept: ${user.department}`}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setStudentTab('profile')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Edit Profile
                    </button>
                  </div>

                  {/* Leave Application Section */}
                  <div className="mt-6">
                    <h4 className="text-md font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-indigo-600" />
                      Apply for Leave
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Leave Date</label>
                        <input
                          type="date"
                          min={new Date().toISOString().split('T')[0]}
                          value={selectedDate.toISOString().split('T')[0]}
                          onChange={(e) => setSelectedDate(new Date(e.target.value))}
                          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:ring-indigo-500 focus:border-indigo-500"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-medium text-gray-700 mb-1">Reason for Leave</label>
                        <input
                          type="text"
                          placeholder="Provide detailed reason for absence"
                          value={leaveReason}
                          onChange={(e) => setLeaveReason(e.target.value)}
                          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:ring-indigo-500 focus:border-indigo-500"
                        />
                      </div>
                    </div>
                    <div className="mt-4 flex justify-end">
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
                            setLeaveReason('');
                            alert("Leave application submitted successfully.");
                          } catch (error) {
                            console.error('Error applying leave:', error);
                            alert('Failed to apply leave. Please try again.');
                          }
                        }}
                        className="inline-flex items-center gap-1.5 px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none cursor-pointer"
                      >
                        Apply Leave
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
                <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm hover:shadow-md transition">
                  <div className="flex items-center space-x-4">
                    <div className="flex-shrink-0 bg-indigo-50 border border-indigo-100 rounded-xl p-3 text-indigo-600">
                      <Calendar className="h-6 w-6" />
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Total Days</span>
                      <span className="text-2xl font-extrabold text-slate-900 mt-0.5 block">{stats.totalDays}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm hover:shadow-md transition">
                  <div className="flex items-center space-x-4">
                    <div className="flex-shrink-0 bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-emerald-600">
                      <User className="h-6 w-6" />
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Present Days</span>
                      <span className="text-2xl font-extrabold text-emerald-600 mt-0.5 block">{stats.presentDays}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm hover:shadow-md transition">
                  <div className="flex items-center space-x-4">
                    <div className="flex-shrink-0 bg-blue-50 border border-blue-100 rounded-xl p-3 text-blue-600">
                      <BarChart3 className="h-6 w-6" />
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Attendance %</span>
                      <span className="text-2xl font-extrabold text-blue-600 mt-0.5 block">{Math.round(stats.attendancePercentage)}%</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Attendance History */}
              <div className="bg-white shadow rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-6 py-5 border-b border-gray-100">
                  <h3 className="text-lg font-bold text-gray-900">Attendance History</h3>
                  <p className="mt-0.5 text-xs text-gray-500">Your attendance logs for the active academic month</p>
                </div>
                <div className="divide-y divide-gray-100">
                  {!attendanceData[user?.id] || attendanceData[user?.id].length === 0 ? (
                    <div className="px-6 py-8 text-center text-sm text-gray-500">
                      No attendance records found yet.
                    </div>
                  ) : (
                    <ul className="divide-y divide-gray-100">
                      {attendanceData[user?.id]?.map((record, index) => {
                        const leaveStatus = leaveApplications[user?.id]?.find(leave => leave.date === record.date);
                        return (
                          <li key={index} className="px-6 py-4 hover:bg-gray-50 transition">
                            <div className="flex items-center justify-between">
                              <div className="text-sm font-semibold text-gray-900">{record.date}</div>
                              <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                                leaveStatus ? (
                                  leaveStatus.status === 'approved' ? 'bg-green-100 text-green-800' :
                                  leaveStatus.status === 'rejected' ? 'bg-red-100 text-red-800' :
                                  'bg-yellow-100 text-yellow-800'
                                ) : record.status === 'present' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
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
                  )}
                </div>
              </div>
            </div>
          )}

          {studentTab === 'profile' && (
            <div className="max-w-3xl mx-auto space-y-6">
              <div className="bg-white shadow rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-6 py-5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white flex justify-between items-center">
                  <div>
                    <h2 className="text-xl font-bold flex items-center gap-2">
                      <User className="w-6 h-6" />
                      Manage Student Profile
                    </h2>
                    <p className="text-xs text-indigo-100 mt-1">View and update your personal information and profile picture</p>
                  </div>
                </div>

                <div className="p-6 space-y-6">
                  {profileMessage.text && (
                    <div className={`p-4 rounded-lg flex items-center gap-3 text-sm font-medium ${
                      profileMessage.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'
                    }`}>
                      {profileMessage.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />}
                      <span>{profileMessage.text}</span>
                    </div>
                  )}

                  {/* Profile Picture Banner */}
                  <div className="flex flex-col sm:flex-row items-center gap-6 p-4 bg-gray-50 rounded-xl border border-gray-200">
                    <div className="relative group">
                      <img
                        src={profileForm.photo || user?.photo || DEFAULT_PROFILE_IMAGE}
                        alt="Profile Preview"
                        className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-md"
                      />
                      <label htmlFor="student-avatar-input" className="absolute bottom-0 right-0 bg-indigo-600 hover:bg-indigo-700 text-white p-2 rounded-full cursor-pointer shadow-lg transition-transform hover:scale-105">
                        <Upload className="w-4 h-4" />
                      </label>
                      <input
                        id="student-avatar-input"
                        type="file"
                        accept="image/*"
                        onChange={handleProfilePhotoUpload}
                        className="hidden"
                      />
                    </div>
                    <div className="text-center sm:text-left">
                      <h4 className="text-base font-semibold text-gray-900">Profile Photo</h4>
                      <p className="text-xs text-gray-500 mt-1">Upload a clear photo of yourself (JPEG/PNG). Recommended size: square photo under 2MB.</p>
                      <label htmlFor="student-avatar-input" className="inline-block mt-3 px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-100 cursor-pointer transition">
                        Choose New Picture
                      </label>
                    </div>
                  </div>

                  <form onSubmit={handleUpdateProfile} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Full Name</label>
                        <input
                          type="text"
                          value={profileForm.name}
                          onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                          placeholder="Your full name"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Email Address</label>
                        <input
                          type="email"
                          value={user?.email || ''}
                          disabled
                          className="w-full px-3 py-2 border border-gray-200 bg-gray-100 text-gray-500 rounded-lg text-sm cursor-not-allowed"
                        />
                        <p className="text-[10px] text-gray-400 mt-1">Email is managed by Admin.</p>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Class / Grade</label>
                        <input
                          type="text"
                          value={profileForm.class}
                          onChange={(e) => setProfileForm({ ...profileForm, class: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                          placeholder="e.g. Class 10A"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Roll Number</label>
                        <input
                          type="text"
                          value={profileForm.rollNo}
                          onChange={(e) => setProfileForm({ ...profileForm, rollNo: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                          placeholder="e.g. 101"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Department / Branch</label>
                        <input
                          type="text"
                          value={profileForm.department}
                          onChange={(e) => setProfileForm({ ...profileForm, department: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                          placeholder="e.g. Science / Computer Science"
                        />
                      </div>
                    </div>

                    <div className="pt-4 flex justify-end">
                      <button
                        type="submit"
                        disabled={isUpdatingProfile}
                        className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md transition ${
                          isUpdatingProfile ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'
                        }`}
                      >
                        {isUpdatingProfile ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            <span>Saving Changes...</span>
                          </>
                        ) : (
                          <>
                            <Save className="w-4 h-4" />
                            <span>Save Profile Changes</span>
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              </div>

              {/* Security & Password Change Section */}
              <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-indigo-600" />
                    Account Security & Password
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Update your current or temporary password to a strong permanent password.
                  </p>
                </div>

                <div className="p-6 space-y-6">
                  {passwordMessage.text && (
                    <div className={`p-4 rounded-xl flex items-center gap-3 text-sm font-medium ${
                      passwordMessage.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'
                    }`}>
                      {passwordMessage.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />}
                      <span>{passwordMessage.text}</span>
                    </div>
                  )}

                  <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-xs leading-relaxed flex items-start gap-2.5">
                    <Key className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <strong className="font-semibold block mb-0.5">Security Guidelines:</strong>
                      Enter your current temporary password provided by Admin, then set a new password containing at least 6 characters.
                    </div>
                  </div>

                  <form onSubmit={handleChangePassword} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                        Current / Temporary Password
                      </label>
                      <div className="relative">
                        <input
                          type={showCurrentPassword ? "text" : "password"}
                          value={passwordForm.currentPassword}
                          onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                          className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                          placeholder="Enter current or temporary password"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                          className="absolute right-3.5 top-3 text-slate-400 hover:text-slate-600"
                        >
                          {showCurrentPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                        New Password
                      </label>
                      <div className="relative">
                        <input
                          type={showNewPassword ? "text" : "password"}
                          value={passwordForm.newPassword}
                          onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                          className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                          placeholder="Enter new password (min. 6 characters)"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                          className="absolute right-3.5 top-3 text-slate-400 hover:text-slate-600"
                        >
                          {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                        Confirm New Password
                      </label>
                      <input
                        type="password"
                        value={passwordForm.confirmPassword}
                        onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                        className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        placeholder="Re-enter new password"
                        required
                      />
                    </div>

                    <div className="pt-4 flex justify-end">
                      <button
                        type="submit"
                        disabled={isChangingPassword}
                        className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 shadow-md transition ${
                          isChangingPassword ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'
                        }`}
                      >
                        {isChangingPassword ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            <span>Updating Password...</span>
                          </>
                        ) : (
                          <>
                            <Key className="w-4 h-4" />
                            <span>Update Password</span>
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          )}
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
      <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-indigo-600 selection:text-white">
        <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200/80 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
            <h1 className="text-xl font-bold text-slate-900">Admin Dashboard</h1>
            <div className="flex items-center space-x-4">
              <span className="text-sm font-semibold text-slate-700">{user?.name}</span>
              <button 
                onClick={handleLogout} 
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 hover:text-red-600 transition cursor-pointer shadow-sm"
                title="Log Out"
              >
                <LogOut size={15} />
                <span>Logout</span>
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
              <button
                id="admin-tab-profile"
                onClick={() => setAdminView('profile')}
                className={`pb-4 px-1 border-b-2 font-medium text-sm transition flex items-center gap-1.5 ${
                  adminView === 'profile'
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <User className="w-4 h-4" />
                <span>My Profile</span>
              </button>
            </nav>
          </div>

          {adminView === 'overview' && (
            <>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-8">
                <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm hover:shadow-md transition">
                  <div className="flex items-center space-x-4">
                    <div className="flex-shrink-0 bg-indigo-50 border border-indigo-100 rounded-xl p-3 text-indigo-600">
                      <User className="h-6 w-6" />
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Total Students</span>
                      <span className="text-2xl font-extrabold text-slate-900 mt-0.5 block">{adminStats.totalStudents}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm hover:shadow-md transition">
                  <div className="flex items-center space-x-4">
                    <div className="flex-shrink-0 bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-emerald-600">
                      <UserCheck className="h-6 w-6" />
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Present Today</span>
                      <span className="text-2xl font-extrabold text-emerald-600 mt-0.5 block">{adminStats.presentToday}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm hover:shadow-md transition">
                  <div className="flex items-center space-x-4">
                    <div className="flex-shrink-0 bg-red-50 border border-red-100 rounded-xl p-3 text-red-600">
                      <User className="h-6 w-6" />
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Absent Today</span>
                      <span className="text-2xl font-extrabold text-red-600 mt-0.5 block">{adminStats.absentToday}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm hover:shadow-md transition">
                  <div className="flex items-center space-x-4">
                    <div className="flex-shrink-0 bg-blue-50 border border-blue-100 rounded-xl p-3 text-blue-600">
                      <BarChart3 className="h-6 w-6" />
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Overall Attendance</span>
                      <span className="text-2xl font-extrabold text-blue-600 mt-0.5 block">{Math.round(adminStats.overallPercentage)}%</span>
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
          )}

          {adminView === 'users' && (
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

              {/* Manage Classes Section */}
              <div className="mb-8 bg-white shadow rounded-lg p-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 pb-4 border-b border-gray-200">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Manage School Classes</h3>
                    <p className="text-xs text-gray-500">Configure classes to assign students and teachers</p>
                  </div>

                  <form onSubmit={handleCreateClass} className="flex items-center gap-2 w-full sm:w-auto">
                    <input
                      type="text"
                      placeholder="Class Name (e.g. 5A, CSE 3B)"
                      value={newClassForm.name}
                      onChange={(e) => setNewClassForm({ ...newClassForm, name: e.target.value })}
                      className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-indigo-500 focus:border-indigo-500"
                      required
                    />
                    <input
                      type="text"
                      placeholder="Dept (e.g. CS)"
                      value={newClassForm.department}
                      onChange={(e) => setNewClassForm({ ...newClassForm, department: e.target.value })}
                      className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-indigo-500 focus:border-indigo-500 w-28"
                    />
                    <button
                      type="submit"
                      className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-sm font-medium shadow-sm transition cursor-pointer"
                    >
                      + Add Class
                    </button>
                  </form>
                </div>

                <div className="flex flex-wrap gap-2">
                  {classesList.map(c => {
                    const studentCount = usersList.filter(u => u.role === 'student' && u.class === c.name).length;
                    const teacherCount = usersList.filter(u => u.role === 'teacher' && (u.class === c.name || (u.assignedClasses || []).includes(c.name))).length;
                    return (
                      <div key={c.id} className="px-3 py-2 bg-indigo-50 border border-indigo-100 rounded-lg flex items-center gap-3">
                        <div>
                          <span className="font-semibold text-sm text-indigo-900">Class {c.name}</span>
                          <span className="text-[10px] block text-indigo-600">{c.department || 'General'}</span>
                        </div>
                        <div className="text-right border-l border-indigo-200 pl-2">
                          <span className="text-xs block text-gray-600">{studentCount} student{studentCount !== 1 ? 's' : ''}</span>
                          <span className="text-xs block text-gray-500">{teacherCount} teacher{teacherCount !== 1 ? 's' : ''}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

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
                          <label className="block text-sm font-medium text-gray-700 mb-1">Assigned Class</label>
                          <select
                            value={createUserForm.class}
                            onChange={(e) => setCreateUserForm({ ...createUserForm, class: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                            required
                          >
                            <option value="">-- Select Class --</option>
                            {classesList.map(c => (
                              <option key={c.id} value={c.name}>Class {c.name} ({c.department || 'General'})</option>
                            ))}
                          </select>
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
                        <label className="block text-sm font-medium text-gray-700 mb-1">Assigned Classes</label>
                        <div className="space-y-1.5 max-h-36 overflow-y-auto border border-gray-200 rounded-md p-2 bg-gray-50">
                          {classesList.map(c => {
                            const isChecked = (createUserForm.assignedClasses || []).includes(c.name);
                            return (
                              <label key={c.id} className="flex items-center space-x-2 text-sm text-gray-700 cursor-pointer hover:bg-gray-100 p-1 rounded">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={(e) => {
                                    const current = createUserForm.assignedClasses || [];
                                    const updated = e.target.checked
                                      ? [...current, c.name]
                                      : current.filter(cls => cls !== c.name);
                                    setCreateUserForm({
                                      ...createUserForm,
                                      assignedClasses: updated,
                                      class: updated.join(', ')
                                    });
                                  }}
                                  className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                                />
                                <span>Class {c.name}</span>
                              </label>
                            );
                          })}
                        </div>
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
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">User Directory</h3>
                      <p className="text-xs text-gray-500">
                        {userDirectoryRoleFilter === 'all'
                          ? `Showing all ${usersList.length} user accounts`
                          : `Filtered by ${userDirectoryRoleFilter}s (${usersList.filter(u => u.role === userDirectoryRoleFilter).length} accounts)`}
                      </p>
                    </div>

                    {/* Role Filter Dropdown Bar */}
                    <div className="flex items-center space-x-2 bg-gray-50 p-1.5 rounded-xl border border-gray-200 w-full sm:w-auto">
                      <label htmlFor="user-directory-role-filter" className="text-xs font-semibold text-gray-500 uppercase tracking-wider pl-1 shrink-0">Filter Role:</label>
                      <select
                        id="user-directory-role-filter"
                        value={userDirectoryRoleFilter}
                        onChange={(e) => setUserDirectoryRoleFilter(e.target.value)}
                        className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-semibold text-gray-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                      >
                        <option value="all">👥 All Users ({usersList.length})</option>
                        <option value="student">🎓 Students Only ({usersList.filter(u => u.role === 'student').length})</option>
                        <option value="teacher">👨‍🏫 Teachers Only ({usersList.filter(u => u.role === 'teacher').length})</option>
                        <option value="admin">🛡️ Admins Only ({usersList.filter(u => u.role === 'admin').length})</option>
                      </select>
                    </div>
                  </div>

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
                      {usersList
                        .filter(usr => userDirectoryRoleFilter === 'all' || usr.role === userDirectoryRoleFilter)
                        .map((usr) => (
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
                        <label className="block text-sm font-medium text-gray-700 mb-1">Assigned Class</label>
                        <select
                          value={editUserForm.class || ''}
                          onChange={(e) => setEditUserForm({ ...editUserForm, class: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        >
                          <option value="">-- Select Class --</option>
                          {classesList.map(c => (
                            <option key={c.id} value={c.name}>Class {c.name} ({c.department || 'General'})</option>
                          ))}
                        </select>
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
                      <label className="block text-sm font-medium text-gray-700 mb-1">Assigned Classes</label>
                      <div className="space-y-1.5 max-h-36 overflow-y-auto border border-gray-200 rounded-md p-2 bg-gray-50">
                        {classesList.map(c => {
                          const teacherClasses = getTeacherAssignedClasses(editUserForm);
                          const isChecked = teacherClasses.includes(c.name);
                          return (
                            <label key={c.id} className="flex items-center space-x-2 text-sm text-gray-700 cursor-pointer hover:bg-gray-100 p-1 rounded">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  const updated = e.target.checked
                                    ? [...teacherClasses, c.name]
                                    : teacherClasses.filter(cls => cls !== c.name);
                                  setEditUserForm({
                                    ...editUserForm,
                                    assignedClasses: updated,
                                    class: updated.join(', ')
                                  });
                                }}
                                className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                              />
                              <span>Class {c.name}</span>
                            </label>
                          );
                        })}
                      </div>
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

          {adminView === 'profile' && (
            <div className="max-w-3xl mx-auto space-y-6">
              <div className="bg-white shadow rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-6 py-5 bg-gradient-to-r from-indigo-700 to-purple-800 text-white flex justify-between items-center">
                  <div>
                    <h2 className="text-xl font-bold flex items-center gap-2">
                      <User className="w-6 h-6" />
                      Manage Admin Profile
                    </h2>
                    <p className="text-xs text-indigo-100 mt-1">View and update your administrator credentials and profile picture</p>
                  </div>
                </div>

                <div className="p-6 space-y-6">
                  {adminProfileMessage.text && (
                    <div className={`p-4 rounded-lg flex items-center gap-3 text-sm font-medium ${
                      adminProfileMessage.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'
                    }`}>
                      {adminProfileMessage.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />}
                      <span>{adminProfileMessage.text}</span>
                    </div>
                  )}

                  {/* Profile Picture Banner */}
                  <div className="flex flex-col sm:flex-row items-center gap-6 p-4 bg-gray-50 rounded-xl border border-gray-200">
                    <div className="relative group">
                      <img
                        src={adminProfileForm.photo || user?.photo || DEFAULT_PROFILE_IMAGE}
                        alt="Profile Preview"
                        className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-md"
                      />
                      <label htmlFor="admin-avatar-input" className="absolute bottom-0 right-0 bg-indigo-600 hover:bg-indigo-700 text-white p-2 rounded-full cursor-pointer shadow-lg transition-transform hover:scale-105">
                        <Upload className="w-4 h-4" />
                      </label>
                      <input
                        id="admin-avatar-input"
                        type="file"
                        accept="image/*"
                        onChange={handleAdminProfilePhotoUpload}
                        className="hidden"
                      />
                    </div>
                    <div className="text-center sm:text-left">
                      <h4 className="text-base font-semibold text-gray-900">Administrator Photo</h4>
                      <p className="text-xs text-gray-500 mt-1">Upload an official avatar (JPEG/PNG). Recommended size under 2MB.</p>
                      <label htmlFor="admin-avatar-input" className="inline-block mt-3 px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-100 cursor-pointer transition">
                        Choose New Picture
                      </label>
                    </div>
                  </div>

                  <form onSubmit={handleUpdateAdminProfile} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Full Name</label>
                        <input
                          type="text"
                          value={adminProfileForm.name}
                          onChange={(e) => setAdminProfileForm({ ...adminProfileForm, name: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                          placeholder="Your full name"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Email Address</label>
                        <input
                          type="email"
                          value={user?.email || ''}
                          disabled
                          className="w-full px-3 py-2 border border-gray-200 bg-gray-100 text-gray-500 rounded-lg text-sm cursor-not-allowed"
                        />
                        <p className="text-[10px] text-gray-400 mt-1">System administrator email.</p>
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Department / Designation</label>
                        <input
                          type="text"
                          value={adminProfileForm.department}
                          onChange={(e) => setAdminProfileForm({ ...adminProfileForm, department: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                          placeholder="e.g. System Administration / IT Head"
                        />
                      </div>
                    </div>

                    <div className="pt-4 flex justify-end">
                      <button
                        type="submit"
                        disabled={isUpdatingAdminProfile}
                        className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md transition ${
                          isUpdatingAdminProfile ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'
                        }`}
                      >
                        {isUpdatingAdminProfile ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            <span>Saving Changes...</span>
                          </>
                        ) : (
                          <>
                            <Save className="w-4 h-4" />
                            <span>Save Profile Changes</span>
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              </div>

              {/* Security & Password Change Section */}
              <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-indigo-600" />
                    Account Security & Password
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Update your admin password to maintain system security.
                  </p>
                </div>

                <div className="p-6 space-y-6">
                  {adminPasswordMessage.text && (
                    <div className={`p-4 rounded-xl flex items-center gap-3 text-sm font-medium ${
                      adminPasswordMessage.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'
                    }`}>
                      {adminPasswordMessage.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />}
                      <span>{adminPasswordMessage.text}</span>
                    </div>
                  )}

                  <div className="p-4 bg-purple-50 rounded-xl border border-purple-200 text-purple-900 text-xs leading-relaxed flex items-start gap-2.5">
                    <Key className="w-4 h-4 text-purple-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <strong className="font-semibold block mb-0.5">Admin Security Protocol:</strong>
                      Re-authenticate with your current password, then set a new password containing at least 6 characters.
                    </div>
                  </div>

                  <form onSubmit={handleAdminChangePassword} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                        Current Password
                      </label>
                      <div className="relative">
                        <input
                          type={showAdminCurrentPassword ? "text" : "password"}
                          value={adminPasswordForm.currentPassword}
                          onChange={(e) => setAdminPasswordForm({ ...adminPasswordForm, currentPassword: e.target.value })}
                          className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                          placeholder="Enter current password"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowAdminCurrentPassword(!showAdminCurrentPassword)}
                          className="absolute right-3.5 top-3 text-slate-400 hover:text-slate-600"
                        >
                          {showAdminCurrentPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                        New Password
                      </label>
                      <div className="relative">
                        <input
                          type={showAdminNewPassword ? "text" : "password"}
                          value={adminPasswordForm.newPassword}
                          onChange={(e) => setAdminPasswordForm({ ...adminPasswordForm, newPassword: e.target.value })}
                          className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                          placeholder="Enter new password (min. 6 characters)"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowAdminNewPassword(!showAdminNewPassword)}
                          className="absolute right-3.5 top-3 text-slate-400 hover:text-slate-600"
                        >
                          {showAdminNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                        Confirm New Password
                      </label>
                      <input
                        type="password"
                        value={adminPasswordForm.confirmPassword}
                        onChange={(e) => setAdminPasswordForm({ ...adminPasswordForm, confirmPassword: e.target.value })}
                        className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        placeholder="Re-enter new password"
                        required
                      />
                    </div>

                    <div className="pt-4 flex justify-end">
                      <button
                        type="submit"
                        disabled={isChangingAdminPassword}
                        className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 shadow-md transition ${
                          isChangingAdminPassword ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'
                        }`}
                      >
                        {isChangingAdminPassword ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            <span>Updating Password...</span>
                          </>
                        ) : (
                          <>
                            <Key className="w-4 h-4" />
                            <span>Update Password</span>
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          )}

          {/* Register Face modal */}
          {isRegisteringFace && registeringStudent && (
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4 z-50">
              <div className="bg-white rounded-lg p-6 max-w-lg w-full shadow-xl">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h3 className="text-lg font-medium text-gray-900">Register Student Face</h3>
                    <p className="text-sm text-gray-500">{registeringStudent.name} (Roll: {registeringStudent.rollNo || 'N/A'})</p>
                  </div>
                  <button onClick={closeRegisterFaceModal} className="text-gray-400 hover:text-gray-600 focus:outline-none">
                    <X size={20} />
                  </button>
                </div>

                {/* Tab Switcher: Webcam vs Upload */}
                <div className="flex border-b border-gray-200 mb-4">
                  <button
                    type="button"
                    onClick={() => {
                      setRegisterTab('webcam');
                      if (isRegisteringFace && registeringStudent) {
                        startRegisterVideo();
                      }
                    }}
                    className={`py-2 px-4 border-b-2 text-sm font-medium focus:outline-none ${
                      registerTab === 'webcam'
                        ? 'border-indigo-600 text-indigo-600 font-semibold'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    📷 Webcam Capture
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRegisterTab('upload');
                      if (registerVideoRef.current && registerVideoRef.current.srcObject) {
                        registerVideoRef.current.srcObject.getTracks().forEach(track => track.stop());
                        registerVideoRef.current.srcObject = null;
                      }
                    }}
                    className={`py-2 px-4 border-b-2 text-sm font-medium focus:outline-none ${
                      registerTab === 'upload'
                        ? 'border-indigo-600 text-indigo-600 font-semibold'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    📁 Upload Photos
                  </button>
                </div>

                {registerTab === 'webcam' ? (
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
                          photosRef.current = [];
                          capturesCountRef.current = 0;
                          lastCenterRef.current = null;
                          lastCaptureTimeRef.current = 0;
                          registerCapturingRef.current = true;
                          setRegisterCapturing(true);
                          setRegisterCaptureProgress(0);
                          setRegisterStatus('Capturing Sample 0/10... Keep face centered');
                        }}
                        disabled={registerCapturing || registerCaptureProgress >= 10}
                        className={`flex-1 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${
                          registerCapturing || registerCaptureProgress >= 10
                            ? 'bg-gray-400 cursor-not-allowed'
                            : 'bg-green-600 hover:bg-green-700'
                        } focus:outline-none cursor-pointer flex items-center justify-center gap-1.5`}
                      >
                        <Camera className="w-4 h-4" />
                        {registerCapturing ? 'Capturing...' : 'Capture'}
                      </button>
                      <button
                        id="register-cancel"
                        type="button"
                        onClick={closeRegisterFaceModal}
                        className="flex-1 py-2 px-4 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <X className="w-4 h-4 text-gray-500" />
                        Close
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Upload File Input Area */}
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-indigo-500 transition-colors">
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        id="face-photo-upload-input"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                      <label htmlFor="face-photo-upload-input" className="cursor-pointer flex flex-col items-center">
                        <Camera className="h-10 w-10 text-indigo-500 mb-2" />
                        <span className="text-sm font-medium text-gray-900">Click to upload sample photos</span>
                        <span className="text-xs text-gray-500 mt-1">Upload 5 or more clear face photos (JPEG, PNG)</span>
                      </label>
                    </div>

                    {/* Image Previews */}
                    {uploadedPhotos.length > 0 && (
                      <div>
                        <div className="flex justify-between text-xs text-gray-500 mb-2">
                          <span>Uploaded Samples: {uploadedPhotos.length}</span>
                          <button
                            type="button"
                            onClick={() => setUploadedPhotos([])}
                            className="text-red-600 hover:underline cursor-pointer"
                          >
                            Clear all
                          </button>
                        </div>
                        <div className="grid grid-cols-4 gap-2 max-h-40 overflow-y-auto p-1 border rounded-md">
                          {uploadedPhotos.map((photoUrl, idx) => (
                            <div key={idx} className="relative group">
                              <img src={photoUrl} alt={`Sample ${idx+1}`} className="w-full h-16 object-cover rounded border" />
                              <button
                                type="button"
                                onClick={() => removeUploadedPhoto(idx)}
                                className="absolute top-0.5 right-0.5 bg-red-600 text-white rounded-full p-0.5 opacity-80 hover:opacity-100"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Status Bar */}
                    <div className="text-center py-2 px-3 bg-gray-50 rounded-md border border-gray-100 min-h-[40px] flex items-center justify-center">
                      <p className="text-sm font-medium text-gray-700">
                        {registerStatus || 'Upload at least 5 photo samples and click Train Model.'}
                      </p>
                    </div>

                    {/* Submit Upload Actions */}
                    <div className="flex space-x-3">
                      <button
                        type="button"
                        onClick={submitUploadedPhotos}
                        disabled={uploadedPhotos.length < 5}
                        className={`flex-1 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${
                          uploadedPhotos.length < 5
                            ? 'bg-gray-400 cursor-not-allowed'
                            : 'bg-indigo-600 hover:bg-indigo-700'
                        } focus:outline-none cursor-pointer flex items-center justify-center gap-1.5`}
                      >
                        Train Model ({uploadedPhotos.length} photos)
                      </button>
                      <button
                        type="button"
                        onClick={closeRegisterFaceModal}
                        className="py-2 px-4 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                )}
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
