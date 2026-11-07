import { Empty } from "../components/States";
export function Attendance(){return <div className="page"><header className="simple-header"><h1>Chấm công</h1><p>Quét QR tại kiosk rồi quay lại Trang chủ để xác minh vị trí.</p></header><Empty title="Chưa có mã QR" body="Mã QR động chỉ có hiệu lực trong 20 giây và được cấp tại chi nhánh."/></div>}
