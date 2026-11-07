import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { storage } from "../lib/storage";

const weekdays=['T2','T3','T4','T5','T6','T7','CN'];
export function Timesheet(){
  const now=new Date(),[cursor,setCursor]=useState(new Date(now.getFullYear(),now.getMonth(),1));
  const records=useMemo(()=>{try{const history=JSON.parse(storage.getItem('hrm_dev_timesheet')||'[]');if(history.length)return history;const current=JSON.parse(storage.getItem('hrm_dev_attendance')||'null');return current?[current]:[]}catch{return []}},[]);
  const year=cursor.getFullYear(),month=cursor.getMonth(),days=new Date(year,month+1,0).getDate(),mondayOffset=(new Date(year,month,1).getDay()+6)%7;
  const cells=Array.from({length:mondayOffset+days},(_,i)=>i<mondayOffset?null:i-mondayOffset+1);
  while(cells.length%7)cells.push(null);
  const monthRecords=records.filter((record:{check_in_at?:string})=>{const date=record.check_in_at?new Date(record.check_in_at):null;return date&&date.getFullYear()===year&&date.getMonth()===month});
  function recordFor(day:number){return monthRecords.find((record:{check_in_at:string})=>new Date(record.check_in_at).getDate()===day)}
  function hours(day:number){const record=recordFor(day);return record?.check_in_at?Math.max(0,((record.check_out_at?new Date(record.check_out_at).getTime():Date.now())-new Date(record.check_in_at).getTime())/3600000):null}
  const total=monthRecords.reduce((sum:number,record:{check_in_at:string;check_out_at?:string|null})=>sum+Math.max(0,((record.check_out_at?new Date(record.check_out_at).getTime():Date.now())-new Date(record.check_in_at).getTime())/3600000),0);
  return <div className="page timesheet-page"><header className="timesheet-header"><Link to="/" aria-label="Quay lại"><ChevronLeft/></Link><div><h1>Bảng công</h1><p>Giờ làm theo từng ngày</p></div></header><section className="month-switch"><button onClick={()=>setCursor(new Date(year,month-1,1))} aria-label="Tháng trước"><ChevronLeft/></button><b>Tháng {month+1}/{year}</b><button onClick={()=>setCursor(new Date(year,month+1,1))} aria-label="Tháng sau"><ChevronRight/></button></section><section className="timesheet-summary"><div><span>Tổng giờ</span><b>{total.toFixed(1)}h</b></div><div><span>Ngày công</span><b>{monthRecords.length}</b></div><div><span>Thiếu công</span><b>0</b></div></section><section className="calendar"><div className="weekdays">{weekdays.map(x=><b key={x}>{x}</b>)}</div><div className="calendar-grid">{cells.map((day,i)=>{const record=day?recordFor(day):null;return day?<article key={i} className={day===now.getDate()&&month===now.getMonth()&&year===now.getFullYear()?'today-cell':''}><span>{day}</span>{hours(day)!==null?<><b>{hours(day)!.toFixed(1)}h</b><small>{record?.check_out_at?'Đủ công':'Đang làm'}</small></>:<i>—</i>}</article>:<div key={i}/>})}</div></section><div className="calendar-legend"><span><i className="done"/>Đủ công</span><span><i className="working"/>Đang làm</span><span><i className="missing"/>Thiếu công</span></div></div>
}
