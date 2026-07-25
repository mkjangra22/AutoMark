import React, { useState } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
import AutomatedAttendanceSystem from "./App2";
import { 
  Camera, 
  MapPin, 
  MessageSquare, 
  Users, 
  ShieldCheck, 
  GraduationCap, 
  ArrowRight, 
  CheckCircle2, 
  Menu, 
  X, 
  Zap, 
  ChevronRight,
  Lock,
  BarChart3
} from "lucide-react";

function LandingPage() {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSignIn = () => {
    navigate("/signin");
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-indigo-600 selection:text-white overflow-x-hidden">
      
      {/* Navigation Header */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200/80 shadow-sm transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            
            {/* Brand Logo & Name */}
            <div className="flex items-center space-x-3 cursor-pointer" onClick={() => navigate('/')}>
              <img
                src="AutoMark-logo-1.png"
                alt="AutoMark Logo"
                className="h-10 w-auto object-contain"
              />
              <div>
                <span className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-1.5">
                  AutoMark <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-semibold border border-indigo-200">AI Attendance</span>
                </span>
                <span className="text-[11px] block text-slate-500 font-medium">Smart Attendance Schooling Platform</span>
              </div>
            </div>

            {/* Desktop Nav Actions */}
            <div className="hidden md:flex items-center space-x-8">
              <a href="#features" className="text-sm font-semibold text-slate-600 hover:text-indigo-600 transition">Features</a>
              <a href="#how-it-works" className="text-sm font-semibold text-slate-600 hover:text-indigo-600 transition">How it Works</a>
              <a href="#impact" className="text-sm font-semibold text-slate-600 hover:text-indigo-600 transition">Impact</a>
              
              <button
                onClick={handleSignIn}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
              >
                <span>Sign In to Portal</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            {/* Mobile Menu Button */}
            <div className="md:hidden flex items-center">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 hover:text-indigo-600 focus:outline-none"
              >
                {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>

          </div>
        </div>

        {/* Mobile Dropdown Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-b border-slate-200 px-4 pt-3 pb-6 space-y-3">
            <a 
              href="#features" 
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2 rounded-lg text-base font-medium text-slate-700 hover:bg-slate-100 hover:text-indigo-600"
            >
              Features
            </a>
            <a 
              href="#how-it-works" 
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2 rounded-lg text-base font-medium text-slate-700 hover:bg-slate-100 hover:text-indigo-600"
            >
              How it Works
            </a>
            <a 
              href="#impact" 
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2 rounded-lg text-base font-medium text-slate-700 hover:bg-slate-100 hover:text-indigo-600"
            >
              Impact
            </a>
            <button
              onClick={() => { setMobileMenuOpen(false); handleSignIn(); }}
              className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md"
            >
              <span>Sign In to Portal</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </header>

      {/* Hero Section */}
      <main className="flex-grow">
        <section className="relative pt-12 pb-20 lg:pt-20 lg:pb-32 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-indigo-50/60 via-slate-50 to-slate-50">
          <div className="max-w-5xl mx-auto text-center space-y-8">
            
            {/* Government Initiative Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-indigo-200 shadow-sm">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-600"></span>
              </span>
              <span className="text-xs font-bold text-indigo-800 tracking-wide">
                Digital Transformation Initiative for Rural & Smart Schools
              </span>
            </div>

            {/* Main Headline */}
            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight leading-tight text-slate-900">
              Automated Facial Attendance <br className="hidden sm:inline" />
              <span className="bg-gradient-to-r from-indigo-600 via-blue-600 to-indigo-800 bg-clip-text text-transparent">
                Powered by AI & GPS Verification
              </span>
            </h1>

            {/* Subtitle */}
            <p className="text-lg sm:text-xl text-slate-600 max-w-3xl mx-auto font-normal leading-relaxed">
              Eliminate proxy attendance and manual registers effortlessly. AutoMark identifies registered students instantly via facial recognition, enforces GPS premises boundaries, and delivers real-time SMS updates to parents.
            </p>

            {/* CTA Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <button
                onClick={handleSignIn}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-8 py-4 rounded-xl text-base font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-600/25 transition-all transform hover:-translate-y-0.5 cursor-pointer"
              >
                <span>Launch</span>
                <ArrowRight className="w-5 h-5" />
              </button>

              <a
                href="#features"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl text-base font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 shadow-sm transition"
              >
                <span>Explore Features</span>
                <ChevronRight className="w-5 h-5 text-slate-400" />
              </a>
            </div>

            {/* App Preview Card */}
            <div className="pt-10 max-w-4xl mx-auto">
              <div className="rounded-3xl p-3 bg-white border border-slate-200 shadow-2xl">
                <div className="bg-slate-900 rounded-2xl p-6 sm:p-8 border border-slate-800 text-left relative overflow-hidden text-white">
                  
                  {/* Top Mock Window Bar */}
                  <div className="flex items-center justify-between pb-6 border-b border-slate-800">
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 rounded-full bg-red-500"></div>
                      <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                      <div className="w-3 h-3 rounded-full bg-green-500"></div>
                      <span className="text-xs text-slate-400 ml-2 font-mono">device-camera</span>
                    </div>
                    <div className="flex items-center space-x-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-3 py-1 rounded-full text-xs font-semibold">
                      <MapPin className="w-3.5 h-3.5" />
                      <span>GPS Premises Verified (Sonipat School)</span>
                    </div>
                  </div>

                  {/* Scanning Grid Mockup */}
                  <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
                    
                    {/* Simulated Video Scanner Window */}
                    <div className="md:col-span-2 relative rounded-xl overflow-hidden bg-slate-950 border border-slate-800 aspect-video flex items-center justify-center">
                      <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/10 via-transparent to-indigo-500/10 animate-pulse"></div>
                      <div className="relative border-2 border-dashed border-indigo-500/60 rounded-xl p-8 text-center">
                        <Camera className="w-12 h-12 text-indigo-400 mx-auto mb-2 animate-bounce" />
                        <span className="text-xs font-semibold text-indigo-300 block">Face Match: 95.8%</span>
                        <span className="text-[10px] text-slate-400 font-mono">Student ID: #2823392 (Class 10A)</span>
                      </div>
                      <div className="absolute bottom-3 left-3 bg-emerald-600 text-white px-3 py-1 rounded-md text-[11px] font-bold shadow-md flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Attendance Marked Present</span>
                      </div>
                    </div>

                    {/* Notification Callout */}
                    <div className="space-y-4">
                      <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                        <div className="flex items-center space-x-2 text-indigo-400 text-xs font-bold">
                          <MessageSquare className="w-4 h-4" />
                          <span>SMS Parent Notification</span>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed font-mono">
                          "Dear Parent, Mayank Kumar is present in the class at 08:30 AM."
                        </p>
                      </div>

                      <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
                        <span className="text-slate-400">Monthly Attendance:</span>
                        <span className="font-bold text-emerald-400">92% Present</span>
                      </div>
                    </div>

                  </div>

                </div>
              </div>
            </div>

          </div>
        </section>

        {/* Live Stats Ribbon */}
        <section id="impact" className="border-y border-slate-200 bg-white py-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
              <div>
                <span className="text-3xl sm:text-4xl font-extrabold text-slate-900 block">90%</span>
                <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider mt-1 block">Recognition Accuracy</span>
              </div>
              <div>
                <span className="text-3xl sm:text-4xl font-extrabold text-indigo-600 block">&lt; 1s</span>
                <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider mt-1 block">Verification Speed</span>
              </div>
              <div>
                <span className="text-3xl sm:text-4xl font-extrabold text-emerald-600 block">100%</span>
                <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider mt-1 block">Proxy Proof</span>
              </div>
              <div>
                <span className="text-3xl sm:text-4xl font-extrabold text-blue-600 block">Instant</span>
                <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider mt-1 block">Parent SMS Alerts</span>
              </div>
            </div>
          </div>
        </section>

        {/* Feature Grid Section */}
        <section id="features" className="py-20 lg:py-32 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-indigo-700 bg-indigo-50 px-3.5 py-1 rounded-full inline-block border border-indigo-200">
              Enterprise Grade Features
            </h2>
            <h3 className="text-3xl sm:text-5xl font-extrabold text-slate-900 tracking-tight">
              Built for Modern & Rural Education
            </h3>
            <p className="text-slate-600 text-base sm:text-lg">
              Everything required to manage student records, prevent absenteeism, and provide complete transparency to faculty and parents.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            
            {/* Feature 1 */}
            <div className="p-8 rounded-2xl bg-white border border-slate-200/80 shadow-sm hover:shadow-md transition group">
              <div className="p-3 bg-indigo-50 rounded-xl w-fit text-indigo-600 group-hover:scale-110 transition-transform">
                <Camera className="w-7 h-7" />
              </div>
              <h4 className="text-xl font-bold text-slate-900 mt-6 mb-2">Facial Recognition AI</h4>
              <p className="text-slate-600 text-sm leading-relaxed">
                Advanced LBPH facial matching algorithm instantly identifies students from live webcam video, preventing proxy sign-ins completely.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="p-8 rounded-2xl bg-white border border-slate-200/80 shadow-sm hover:shadow-md transition group">
              <div className="p-3 bg-blue-50 rounded-xl w-fit text-blue-600 group-hover:scale-110 transition-transform">
                <MapPin className="w-7 h-7" />
              </div>
              <h4 className="text-xl font-bold text-slate-900 mt-6 mb-2">GPS Premises Verification</h4>
              <p className="text-slate-600 text-sm leading-relaxed">
                GPS geo-fencing ensures attendance can only be marked within school campus boundaries. Features built-in mock location toggle for testing.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="p-8 rounded-2xl bg-white border border-slate-200/80 shadow-sm hover:shadow-md transition group">
              <div className="p-3 bg-emerald-50 rounded-xl w-fit text-emerald-600 group-hover:scale-110 transition-transform">
                <MessageSquare className="w-7 h-7" />
              </div>
              <h4 className="text-xl font-bold text-slate-900 mt-6 mb-2">Real-Time SMS Alerts</h4>
              <p className="text-slate-600 text-sm leading-relaxed">
                Instant SMS notifications sent directly to parents detailing arrival time or absence status for seamless parent-school communication.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="p-8 rounded-2xl bg-white border border-slate-200/80 shadow-sm hover:shadow-md transition group">
              <div className="p-3 bg-purple-50 rounded-xl w-fit text-purple-600 group-hover:scale-110 transition-transform">
                <Users className="w-7 h-7" />
              </div>
              <h4 className="text-xl font-bold text-slate-900 mt-6 mb-2">Multi-Role Portals</h4>
              <p className="text-slate-600 text-sm leading-relaxed">
                Tailored dashboards for Teachers (scanning & roster management), Students (statistics & leave requests), and Admins (system metrics & users).
              </p>
            </div>

            {/* Feature 5 */}
            <div className="p-8 rounded-2xl bg-white border border-slate-200/80 shadow-sm hover:shadow-md transition group">
              <div className="p-3 bg-amber-50 rounded-xl w-fit text-amber-600 group-hover:scale-110 transition-transform">
                <Lock className="w-7 h-7" />
              </div>
              <h4 className="text-xl font-bold text-slate-900 mt-6 mb-2">Secure & Private Data</h4>
              <p className="text-slate-600 text-sm leading-relaxed">
                Encrypted database storage with Firebase Firestore, secure password hashing, and privacy-compliant facial dataset management.
              </p>
            </div>

            {/* Feature 6 */}
            <div className="p-8 rounded-2xl bg-white border border-slate-200/80 shadow-sm hover:shadow-md transition group">
              <div className="p-3 bg-pink-50 rounded-xl w-fit text-pink-600 group-hover:scale-110 transition-transform">
                <GraduationCap className="w-7 h-7" />
              </div>
              <h4 className="text-xl font-bold text-slate-900 mt-6 mb-2">Leave Request Management</h4>
              <p className="text-slate-600 text-sm leading-relaxed">
                Students can apply for leave digitally, allowing teachers to review, approve, or reject absence applications in real-time.
              </p>
            </div>

          </div>
        </section>

        {/* How It Works Section */}
        <section id="how-it-works" className="py-20 bg-slate-100/70 border-t border-slate-200 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <div className="text-center max-w-3xl mx-auto mb-16 space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-widest text-emerald-700 bg-emerald-50 px-3.5 py-1 rounded-full inline-block border border-emerald-200">
                Simple 3-Step Workflow
              </h2>
              <h3 className="text-3xl sm:text-4xl font-extrabold text-slate-900">How AutoMark Operates</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="p-8 rounded-2xl bg-white border border-slate-200 shadow-sm relative">
                <span className="text-5xl font-black text-slate-200 absolute top-4 right-6">01</span>
                <div className="p-3 bg-indigo-50 rounded-xl text-indigo-600 w-fit mb-4">
                  <Camera className="w-6 h-6" />
                </div>
                <h4 className="text-lg font-bold text-slate-900 mb-2">1. Start Webcam Scan</h4>
                <p className="text-slate-600 text-sm">Teacher activates live camera scan from the dashboard at school opening.</p>
              </div>

              <div className="p-8 rounded-2xl bg-white border border-slate-200 shadow-sm relative">
                <span className="text-5xl font-black text-slate-200 absolute top-4 right-6">02</span>
                <div className="p-3 bg-blue-50 rounded-xl text-blue-600 w-fit mb-4">
                  <Zap className="w-6 h-6" />
                </div>
                <h4 className="text-lg font-bold text-slate-900 mb-2">2. AI Matches Face & Location</h4>
                <p className="text-slate-600 text-sm">System verifies facial embeddings and checks school GPS radius simultaneously.</p>
              </div>

              <div className="p-8 rounded-2xl bg-white border border-slate-200 shadow-sm relative">
                <span className="text-5xl font-black text-slate-200 absolute top-4 right-6">03</span>
                <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600 w-fit mb-4">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h4 className="text-lg font-bold text-slate-900 mb-2">3.Mark Attendace & Save record</h4>
                <p className="text-slate-600 text-sm">Firestore record updates instantly and SMS alert is sent to parent mobile.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Call To Action Banner */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto">
          <div className="rounded-3xl p-8 sm:p-12 bg-gradient-to-r from-indigo-600 to-blue-600 text-center space-y-6 shadow-xl text-white">
            <h3 className="text-3xl sm:text-5xl font-extrabold tracking-tight">
              Ready to Upgrade School Attendance?
            </h3>
            <p className="text-indigo-100 max-w-2xl mx-auto text-base sm:text-lg">
              Sign in with your assigned faculty, student, or admin account to access your dashboard.
            </p>
            <div className="pt-2">
              <button
                onClick={handleSignIn}
                className="inline-flex items-center gap-2 px-8 py-4 rounded-xl text-base font-bold text-indigo-700 bg-white hover:bg-slate-100 shadow-lg transition-all cursor-pointer transform hover:scale-105"
              >
                <span>Access Portal Now</span>
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-8 px-4 text-center text-xs text-slate-500 space-y-2">
        <p>© 2026 AutoMark Smart Attendance System. Digital Transformation Initiative for Rural & Smart Schools.</p>
        <p className="text-slate-400">Powered by AI Facial Recognition & Real-time Cloud Infrastructure</p>
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
