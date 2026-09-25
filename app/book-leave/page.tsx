"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { AlertTriangle, CalendarDays, Check, ChevronDown, Info, Minus, Equal } from "lucide-react";

export default function BookLeavePage(){
  const [mode,setMode]=useState<"single"|"multi">("multi");
  const [submitted,setSubmitted]=useState(false);
  const days=mode==="single"?1:3;
  const projected=15-days;
  return <AppShell>
    <section className="page-head"><Link className="back-link" href="/">← Back to Home</Link><h1>Book Leave</h1><p>Submit a new leave request. We’ll check team availability and show your updated balance.</p></section>
    {submitted && <div className="success-banner"><Check size={18}/> Leave request submitted. Your manager has been notified.</div>}
    <section className="booking-grid">
      <form className="card leave-form" onSubmit={(e)=>{e.preventDefault();setSubmitted(true)}}>
        <div className="section-heading"><h2>Leave Details</h2><p>Select the type of leave and your preferred dates.</p></div>
        <label>Leave type<div className="field select-field"><CalendarDays size={18}/><span>Annual Leave</span><ChevronDown size={17}/></div></label>
        <label>Leave period<div className="segment"><button type="button" className={mode==="single"?"active":""} onClick={()=>setMode("single")}><span className="radio-dot"/>Single day</button><button type="button" className={mode==="multi"?"active":""} onClick={()=>setMode("multi")}><span className="radio-dot"/>Multi day</button></div></label>
        <div className="field-row"><label>Start date<div className="field"><CalendarDays size={18}/><span>28 September 2026</span><ChevronDown size={16}/></div></label><label>End date<div className="field"><CalendarDays size={18}/><span>{mode==="single"?"28 September 2026":"30 September 2026"}</span><ChevronDown size={16}/></div></label></div>
        <label>Duration<div className="duration-box"><span className="summary-icon"><CalendarDays size={20}/></span><div><strong>{days} {days===1?"day":"days"}</strong><span>{mode==="single"?"Monday, 28 September 2026":"Monday, 28 September – Wednesday, 30 September 2026"}</span></div></div></label>
        <label>Note <span className="muted">(optional)</span><textarea placeholder="Add a note for your manager (optional)..."/><span className="counter">0 / 500</span></label>
        <div className="form-actions"><Link href="/" className="btn secondary">Cancel</Link><button className="btn primary" type="submit">Submit Request</button></div>
      </form>
      <div className="booking-side">
        <section className="card balance-card"><div className="card-title"><h2>Leave Balance</h2><a>View all</a></div><div className="balance-highlight"><span className="summary-icon"><CalendarDays size={20}/></span><div><span>Current Annual Leave Balance</span><strong>15 <small>days</small></strong><small>of 15 days for 2026/27</small></div></div><div className="balance-math"><div><span className="math-icon amber"><Minus size={18}/></span><div><span>This Request</span><strong>{days} {days===1?"day":"days"}</strong></div></div><div><span className="math-icon green"><Equal size={18}/></span><div><span>Projected Balance</span><strong>{projected} days</strong><small>remaining after this request</small></div></div></div></section>
        <section className="card coverage-card"><h2>Team Coverage</h2><div className="coverage-alert"><AlertTriangle size={22}/><div><strong>Mostly covered</strong><p>Your team is well covered. Availability is slightly lower on 30 September.</p></div></div>{[["MON","28 SEP","Good coverage","7 of 8 team members available",true],["TUE","29 SEP","Good coverage","7 of 8 team members available",true],["WED","30 SEP","Limited coverage","5 of 8 team members available",false]].slice(0,days).map(([dow,date,title,sub,good])=><div className="coverage-row" key={date as string}><div className="date-stack"><strong>{dow}</strong><span>{date}</span></div><span className={`coverage-icon ${good?"good":"warn"}`}>{good?<Check size={17}/>:<span>!</span>}</span><div><strong className={good?"":"warning-text"}>{title}</strong><span>{sub}</span></div><ChevronDown size={16}/></div>)}</section>
        <section className="card calc-card"><h2><Info size={19}/> How your leave is calculated</h2><div className="calc-row"><span>Total calendar days</span><strong>{days}</strong></div><div className="calc-row"><span>Public holidays (excluded)</span><strong>0</strong></div><div className="calc-row"><span>Non-working days (excluded)</span><strong>0</strong></div><div className="calc-row total"><span>Working days counted</span><strong>{days}</strong></div></section>
      </div>
    </section>
  </AppShell>
}
