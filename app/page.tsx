import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { StatusPill } from "@/components/StatusPill";
import { AlertTriangle, CalendarDays, Check, ChevronRight, Clock3, Users, X } from "lucide-react";

const requests = [
  ["12 – 16 May 2026", "Annual Leave", "5 days", "Approved"],
  ["30 Sep 2026", "Personal Leave", "1 day", "Pending"],
  ["10 – 12 Oct 2026", "Annual Leave", "3 days", "Pending"],
  ["18 Aug 2026", "Sick Leave", "1 day", "Approved"],
  ["3 Mar 2026", "Annual Leave", "4 days", "Declined"],
] as const;

const approvals = [
  ["JM", "Jessica Mthembu", "Annual Leave", "28–30 Sep 2026", "3 days"],
  ["DK", "Daniel Kgope", "Annual Leave", "16–20 Oct 2026", "5 days"],
  ["NT", "Nomusa Tshabalala", "Family Responsibility", "6 Oct 2026", "1 day"],
];

const team = [
  ["TD","Thabo Dlamini","Engineering",["","","","Annual Leave","Annual Leave","",""]],
  ["PN","Priya Naidoo","Engineering",["","Sick Leave","","","","",""]],
  ["SK","Sipho Khumalo","Marketing",["Annual Leave","Annual Leave","","","","",""]],
  ["AP","Aisha Patel","Marketing",["","","","","Annual Leave","",""]],
  ["LB","Liam Brown","Product",["","","Work From Home","","","",""]],
] as const;

function SummaryCard({tone, icon, label, value, unit, sub}:{tone:string,icon:React.ReactNode,label:string,value:string,unit:string,sub:string}) {
  return <div className={`summary-card ${tone}`}>
    <div className="summary-head"><span className="summary-icon">{icon}</span><span>{label}</span></div>
    <div className="summary-value">{value} <small>{unit}</small></div>
    <div className="summary-foot"><span>{sub}</span><ChevronRight size={17}/></div>
  </div>
}

export default function HomePage(){
  return <AppShell>
    <section className="page-head split">
      <div><p className="eyebrow">Friday, 25 September 2026</p><h1>Good morning, Langa</h1><p>Here’s what’s happening with your leave and your team today.</p></div>
      <Link href="/book-leave" className="btn primary"><CalendarDays size={18}/> Book Leave</Link>
    </section>

    <section className="summary-grid">
      <SummaryCard tone="teal" icon={<CalendarDays size={20}/>} label="Annual Leave Available" value="15" unit="days" sub="of 15 days" />
      <SummaryCard tone="amber" icon={<Clock3 size={20}/>} label="Pending Requests" value="2" unit="requests" sub="1 for your approval" />
      <SummaryCard tone="blue" icon={<Users size={20}/>} label="Team Away Today" value="2" unit="people" sub="out of 8" />
      <SummaryCard tone="red" icon={<AlertTriangle size={20}/>} label="Coverage Alerts" value="1" unit="alert" sub="Operations team" />
    </section>

    <section className="two-col">
      <div className="card data-card">
        <div className="card-title"><h2>My Leave & Requests</h2><a>View all</a></div>
        <div className="tabs"><button className="active">Recent Requests</button><button>Upcoming Leave</button><button>Leave Balance</button></div>
        <div className="table-scroll"><table><thead><tr><th>Date</th><th>Type</th><th>Duration</th><th>Status</th></tr></thead><tbody>
          {requests.map(([date,type,duration,status])=><tr key={date}><td>{date}</td><td>{type}</td><td>{duration}</td><td><StatusPill status={status}/></td></tr>)}
        </tbody></table></div>
      </div>
      <div className="card approvals-card">
        <div className="card-title"><h2>Approvals / My Work</h2><a>View all</a></div>
        <div className="tabs"><button className="active">Pending Approvals</button><button>Team Requests</button></div>
        <div className="approval-list">
          {approvals.map(([initials,name,type,date,duration],i)=><div className="approval-row" key={name}>
            <div className={`mini-avatar a${i+1}`}>{initials}</div><div className="approval-person"><strong>{name}</strong><span>{type}</span></div>
            <div className="approval-date"><strong>{date}</strong><span>{duration}</span></div>
            <div className="approval-actions"><button className="approve" aria-label={`Approve ${name}`}><Check size={18}/></button><button className="reject" aria-label={`Decline ${name}`}><X size={18}/></button></div>
          </div>)}
        </div>
        <button className="text-link">View all pending approvals <ChevronRight size={16}/></button>
      </div>
    </section>

    <section className="card availability-card">
      <div className="availability-head"><div><h2>Team Availability</h2><p>See who’s away and upcoming leave across your team.</p></div><div className="date-controls"><button>‹</button><span>25 Sep – 1 Oct 2026</span><button>›</button><button className="today">Today</button></div></div>
      <div className="table-scroll"><table className="availability-table"><thead><tr><th>Employee</th><th>Team</th>{["Fri 25","Sat 26","Sun 27","Mon 28","Tue 29","Wed 30","Thu 01"].map(d=><th key={d}>{d}</th>)}</tr></thead><tbody>
        {team.map(([initials,name,dept,days],ri)=><tr key={name}><td><span className="person-cell"><span className={`tiny-avatar t${ri+1}`}>{initials}</span>{name}</span></td><td>{dept}</td>{days.map((v,idx)=><td key={idx}>{v ? <span className={`leave-chip ${v.includes("Sick")?"sick":v.includes("Work")?"info":ri===2?"amber":"annual"}`}>{v}</span> : <span className="empty">–</span>}</td>)}</tr>)}
      </tbody></table></div>
    </section>
  </AppShell>
}
