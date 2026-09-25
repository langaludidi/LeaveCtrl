"use client";
import { useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Check, ChevronRight, Clock3, FileText, MapPin, Settings, Users, Zap } from "lucide-react";

const steps=["Organisation details","People and teams","Leave rules","Working patterns","Approval flows","Notifications","Review and finish"];

export default function SetupPage(){
  const [route,setRoute]=useState<"recommended"|"upload"|"manual">("recommended");
  const [extra,setExtra]=useState(true);
  return <AppShell>
    <section className="page-head setup-head"><Link className="back-link" href="/">← Back to home</Link><div className="split"><div><h1>Set up your organisation</h1><p>A few quick steps to get your leave platform ready. You can always change these settings later.</p></div><strong>Step 3 of 7 — Leave rules</strong></div></section>
    <div className="stepper">{steps.map((s,i)=><div className={`step ${i<2?"done":i===2?"current":""}`} key={s}><div className="step-line"/><div className="step-circle">{i<2?<Check size={16}/>:i+1}</div><span>{s}</span></div>)}</div>
    <section className="setup-grid">
      <div className="card setup-card"><div className="section-heading"><h2>Leave rules and entitlements</h2><p>Tell us how leave works at your organisation. We’ve pre-filled settings for South Africa to make this easier.</p></div>
        <div className="setting-row"><div><strong>Country</strong><span>This sets public holidays and default leave rules.</span></div><div className="inline-select">🇿🇦 South Africa <span>⌄</span></div></div>
        <div className="setting-row"><div><strong>Public holidays</strong><span>South African public holidays will be applied to everyone’s calendar.</span></div><div className="success-chip"><Check size={16}/> <div><strong>South Africa defaults applied</strong><span>12 public holidays for 2026</span></div><a>View</a></div></div>
        <div className="setting-row route-row"><div><strong>Choose your setup route</strong><span>Start quickly with our South African defaults, upload your policy, or configure manually.</span></div><div className="route-options"><button onClick={()=>setRoute("recommended")} className={route==="recommended"?"selected":""}><Zap size={23}/><strong>Recommended South African setup</strong><span>Use standard SA leave rules and tweak if needed.</span></button><button onClick={()=>setRoute("upload")} className={route==="upload"?"selected":""}><FileText size={23}/><strong>Upload leave policy</strong><span>We’ll extract proposed rules for you to review.</span></button><button onClick={()=>setRoute("manual")} className={route==="manual"?"selected":""}><Settings size={23}/><strong>Configure manually</strong><span>Set up all leave types and rules yourself.</span></button></div></div>
        <div className="setting-row"><div><strong>Annual leave enhancement</strong><span>Set additional annual leave above the configured statutory baseline.</span></div><div className="toggle-line"><button className={`toggle ${extra?"on":""}`} onClick={()=>setExtra(v=>!v)}><span/></button><span>Add additional annual leave days</span>{extra&&<div className="small-number">5</div>}</div></div>
        <div className="setting-row"><div><strong>Sick leave evidence</strong><span>Set when supporting medical evidence may be required.</span></div><div className="inline-select">After 2 consecutive days <span>⌄</span></div></div>
        <div className="setting-row"><div><strong>Additional leave types</strong><span>Enable the leave types that apply at your organisation.</span></div><div className="checkbox-grid">{["Family responsibility leave","Bereavement leave","Parental leave","Study leave","Unpaid leave","Wellness leave"].map((x,i)=><label key={x}><input type="checkbox" defaultChecked={i<3}/><span>{x}</span></label>)}</div></div>
        <div className="setup-actions"><button className="btn secondary">Save and exit</button><div><button className="btn ghost">Back</button><button className="btn primary">Continue to working patterns <ChevronRight size={17}/></button></div></div>
      </div>
      <aside className="setup-side"><div className="card progress-card"><div className="ring">3 <small>of 7</small></div><div><h3>Your organisation is on track</h3><p>Complete the remaining steps to finish setting up LeaveCtrl.</p></div></div><div className="card checklist"><h3>Setup checklist</h3>{steps.map((s,i)=><div className={`check-item ${i<2?"done":i===2?"current":""}`} key={s}><span>{i<2?<Check size={14}/>:i+1}</span><strong>{s}</strong>{i===2&&<ChevronRight size={15}/>}</div>)}</div><div className="card info-card"><MapPin size={22}/><div><h3>South African employment defaults applied</h3><p>South African leave-rule defaults and public holidays are loaded for review.</p><a>Learn more about SA leave rules →</a></div></div><div className="card info-card"><Clock3 size={22}/><div><h3>You can finish later</h3><p>Your progress is saved automatically. Come back and complete setup at any time.</p></div></div><div className="card info-card"><Users size={22}/><div><h3>Need help?</h3><p>Our team can help you get set up.</p><a>Contact support →</a></div></div></aside>
    </section>
  </AppShell>
}
