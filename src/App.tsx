import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { Dashboard } from "./pages/Dashboard";
import { Requests } from "./pages/Requests";
import { Analytics } from "./pages/Analytics";
import { Profile } from "./pages/Profile";
import { AuthGate } from "./components/AuthGate";
import { Timesheet } from "./pages/Timesheet";
import { AdminPage } from "./pages/Admin";

export default function App(){return <AuthGate><Routes><Route path="admin" element={<AdminPage/>}/><Route element={<AppShell/>}><Route index element={<Dashboard/>}/><Route path="timesheet" element={<Timesheet/>}/><Route path="requests" element={<Requests/>}/><Route path="analytics" element={<Analytics/>}/><Route path="profile" element={<Profile/>}/></Route><Route path="*" element={<Navigate to="/" replace/>}/></Routes></AuthGate>}
