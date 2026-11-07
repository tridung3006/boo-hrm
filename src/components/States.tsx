import { AlertCircle, Inbox } from "lucide-react";
export function Skeleton(){return <div className="skeletons" aria-label="Đang tải"><i/><i/><i/></div>}
export function Empty({title,body}:{title:string;body:string}){return <div className="state"><Inbox/><b>{title}</b><p>{body}</p></div>}
export function ErrorState({message,retry}:{message:string;retry?:()=>void}){return <div className="state error"><AlertCircle/><b>Không thể tải dữ liệu</b><p>{message}</p>{retry&&<button className="outline" onClick={retry}>Thử lại</button>}</div>}
