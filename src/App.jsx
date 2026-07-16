import { Routes, Route, useNavigate } from "react-router-dom";
import AutomatedAttendanceSystem from "./App2";

function LandingPage() {
  const navigate = useNavigate();

  const handleSignIn = () => {
    navigate("/signin"); // redirects to App2.jsx
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Navbar */}
      <header className="flex justify-between items-center px-8 py-4 border-b">
        <div>
          <img
            src="AutoMark-logo-1.png"
            alt="Logo"
            className="w-320 h-16 object-contain"
          />
          {/* <h1 className="text-xl font-bold">AutoMark</h1>
          <p className="text-sm text-gray-600">Attendance</p> */}
        </div>
        <button
          onClick={handleSignIn}
          className="text-sm font-semibold"
        >
          Sign In
        </button>
      </header>

      {/* Hero Section */}
      <main className="flex-grow px-6 md:px-16 py-12 text-center">
        <h2 className="text-3xl font-bold mb-4">
          Automated Attendance System
        </h2>
        <p className="text-lg text-gray-700 mb-8 max-w-2xl mx-auto">
          Revolutionizing attendance tracking in rural schools with facial
          recognition, geolocation verification, and real-time SMS
          notifications to parents.
        </p>
          <button
            onClick={handleSignIn}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 transition"
          >
            Get Started
          </button>

        {/* Features Row 1 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
          <div className="border rounded-xl p-6 shadow-sm">
            <h3 className="text-lg font-semibold mb-2">
              📷 Facial Recognition
            </h3>
            <p className="text-gray-600 text-sm">
              Advanced facial recognition technology ensures accurate student
              identification and prevents proxy attendance, making the system
              foolproof and reliable.
            </p>
          </div>

          <div className="border rounded-xl p-6 shadow-sm">
            <h3 className="text-lg font-semibold mb-2">
              📍 Geolocation Verification
            </h3>
            <p className="text-gray-600 text-sm">
              GPS-based location verification ensures attendance can only be
              marked within school premises, preventing unauthorized remote
              attendance marking.
            </p>
          </div>

          <div className="border rounded-xl p-6 shadow-sm">
            <h3 className="text-lg font-semibold mb-2">
              💬 SMS Notifications
            </h3>
            <p className="text-gray-600 text-sm">
              Instant SMS alerts to parents about their child's attendance
              status, including arrival time and absence notifications for
              better communication.
            </p>
          </div>
        </div>

        {/* Features Row 2 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
          <div className="border rounded-xl p-6 shadow-sm">
            <h3 className="text-lg font-semibold mb-2">👥 Multi-Role Access</h3>
            <p className="text-gray-600 text-sm">
              Separate dashboards for teachers, students, and administrators
              with role-based permissions for comprehensive attendance
              management.
            </p>
          </div>

          <div className="border rounded-xl p-6 shadow-sm">
            <h3 className="text-lg font-semibold mb-2">🔒 Secure & Private</h3>
            <p className="text-gray-600 text-sm">
              Enterprise-grade security with encrypted data storage, secure
              authentication, and privacy-compliant facial data handling.
            </p>
          </div>

          <div className="border rounded-xl p-6 shadow-sm">
            <h3 className="text-lg font-semibold mb-2">
              🎓 Government Initiative
            </h3>
            <p className="text-gray-600 text-sm">
              Part of the Ministry of Education's digital transformation
              program for rural schools, ensuring standardized attendance
              tracking nationwide.
            </p>
          </div>
        </div>

        {/* Call to Action */}
        <div className="border rounded-xl p-8 mt-12 shadow-sm">
          <h3 className="text-xl font-bold mb-2">
            Ready to Transform Attendance Tracking?
          </h3>
          <p className="text-gray-700 mb-4">
            Join thousands of rural schools already using our smart attendance
            system. Sign in with your government-provided credentials to get
            started.
          </p>
          <button
            onClick={handleSignIn}
            className="bg-gray-900 text-white px-6 py-2 rounded-lg font-medium hover:bg-gray-800 transition"
          >
            Sign In to Continue
          </button>
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center py-4 border-t text-sm text-gray-600">
        © 2024 Smart Attendance System. Ministry of Education, Government
        Initiative for Rural Schools.
      </footer>
    </div>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/signin" element={<AutomatedAttendanceSystem />} />
    </Routes>
  );


}

export default App;
