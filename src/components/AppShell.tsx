import { BarChart3, FileText, House, UserRound } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";

const items=[['/',House,'Trang chủ'],['/requests',FileText,'Đơn từ'],['/analytics',BarChart3,'Thống kê'],['/profile',UserRound,'Cá nhân']] as const;
export function AppShell(){return <div className="app-shell"><main><Outlet/></main><nav className="bottom-nav" aria-label="Điều hướng chính">{items.map(([to,Icon,label])=><NavLink key={to} to={to} end={to==='/' }><Icon size={20}/><span>{label}</span></NavLink>)}</nav></div>}
