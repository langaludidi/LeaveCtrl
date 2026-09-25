"use client";

import { FormEvent, useState } from "react";
import { Building2, Coins, Repeat2, Save, Shuffle } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Option={id:string;name:string};

export function WorkforceChangeControls({
  people,departments,schedules,locations,
}:{
  people:Option[];
  departments:Option[];
  schedules:Option[];
  locations:Option[];
}) {
  const router=useRouter();
  const [saving,setSaving]=useState("");
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");

  async function recordChange(event:FormEvent<HTMLFormElement>){
    event.preventDefault(); setSaving("change"); setError(""); setNotice("");
    const form=new FormData(event.currentTarget);
    const nullish=(name:string)=>String(form.get(name)??"")||undefined;
    const {error:rpcError}=await createClient().rpc("apply_employee_condition_change",{
      p_employee_id:String(form.get("employee")),
      p_effective_from:String(form.get("effectiveFrom")),
      p_department_id:nullish("department"),
      p_manager_employee_id:nullish("manager"),
      p_work_schedule_id:String(form.get("schedule")),
      p_location_id:nullish("location"),
      p_work_mode:String(form.get("workMode")),
      p_change_type:String(form.get("changeType")),
      p_reason:String(form.get("reason")??"").trim()||undefined,
    });
    setSaving("");
    if(rpcError){setError("The staff change could not be recorded.");return;}
    setNotice("Staff change recorded with its effective date.");
    router.refresh();
  }

  async function createLocation(event:FormEvent<HTMLFormElement>){
    event.preventDefault(); setSaving("location"); setError(""); setNotice("");
    const form=new FormData(event.currentTarget);
    const {error:rpcError}=await createClient().rpc("create_location",{
      p_name:String(form.get("name")??"").trim(),
      p_code:String(form.get("code")??"").trim()||undefined,
    });
    setSaving("");
    if(rpcError){setError("Location could not be created.");return;}
    event.currentTarget.reset(); setNotice("Location created."); router.refresh();
  }

  async function createShift(event:FormEvent<HTMLFormElement>){
    event.preventDefault(); setSaving("shift"); setError(""); setNotice("");
    const form=new FormData(event.currentTarget);
    const {error:rpcError}=await createClient().rpc("create_rotating_shift_schedule",{
      p_name:String(form.get("name")??"").trim(),
      p_anchor_date:String(form.get("anchorDate")),
      p_cycle_pattern:String(form.get("pattern")??"").trim(),
    });
    setSaving("");
    if(rpcError){setError("Shift pattern could not be created. Use comma-separated daily hours.");return;}
    event.currentTarget.reset(); setNotice("Rotating shift pattern created."); router.refresh();
  }

  async function saveRemuneration(event:FormEvent<HTMLFormElement>){
    event.preventDefault(); setSaving("remuneration"); setError(""); setNotice("");
    const form=new FormData(event.currentTarget);
    const override=String(form.get("dailyRate")??"").trim();
    const {error:rpcError}=await createClient().rpc("set_employee_remuneration",{
      p_employee_id:String(form.get("employee")),
      p_effective_from:String(form.get("effectiveFrom")),
      p_gross_amount:Number(form.get("amount")??0),
      p_pay_frequency:String(form.get("frequency")),
      p_daily_rate_override:override?Number(override):undefined,
      p_reason:String(form.get("reason")??"").trim()||undefined,
    });
    setSaving("");
    if(rpcError){setError("Remuneration could not be saved.");return;}
    setNotice("Confidential remuneration history updated.");
    router.refresh();
  }

  return <section className="workforce-change-section">
    {error?<div className="auth-alert error">{error}</div>:null}
    {notice?<div className="auth-alert success">{notice}</div>:null}

    <div className="card workforce-change-card">
      <div className="card-title">
        <div><h2>Staff transfers & working conditions</h2><p className="card-subtitle">Record future or immediate changes without overwriting employment history.</p></div>
        <Shuffle size={19}/>
      </div>
      <form className="workforce-change-form" onSubmit={recordChange}>
        <label>Employee<select className="native-field" name="employee" required>{people.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label>Effective date<input className="native-field" name="effectiveFrom" type="date" required/></label>
        <label>Change type<select className="native-field" name="changeType" defaultValue="combined_change">
          <option value="transfer">Transfer</option><option value="schedule_change">Working schedule</option>
          <option value="work_mode_change">Work arrangement</option><option value="manager_change">Manager</option>
          <option value="combined_change">Combined change</option>
        </select></label>
        <label>Department<select className="native-field" name="department" defaultValue=""><option value="">No department</option>{departments.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label>Manager<select className="native-field" name="manager" defaultValue=""><option value="">No manager</option>{people.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label>Work schedule<select className="native-field" name="schedule" required>{schedules.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label>Location<select className="native-field" name="location" defaultValue=""><option value="">No fixed location</option>{locations.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label>Work arrangement<select className="native-field" name="workMode" defaultValue="onsite"><option value="onsite">On-site</option><option value="hybrid">Hybrid</option><option value="remote">Remote / work from home</option><option value="field">Field based</option></select></label>
        <label className="wide-field">Reason / note <span className="muted">(optional)</span><input className="native-field" name="reason"/></label>
        <button className="btn primary" disabled={saving==="change"} type="submit"><Save size={16}/>{saving==="change"?"Saving…":"Record change"}</button>
      </form>
    </div>

    <div className="admin-two-col">
      <form className="card admin-mini-card" onSubmit={createShift}>
        <div className="card-title"><div><h2>Rotating shift pattern</h2><p className="card-subtitle">For rosters that repeat rather than follow a fixed Monday–Sunday week.</p></div><Repeat2 size={19}/></div>
        <label>Pattern name<input name="name" placeholder="4-on / 4-off" required/></label>
        <label>Cycle anchor date<input name="anchorDate" type="date" required/></label>
        <label>Cycle hours<input name="pattern" placeholder="12,12,12,12,0,0,0,0" required/></label>
        <span className="field-help">Enter scheduled hours for each successive day in the cycle. Zero means off-duty.</span>
        <button className="btn primary" disabled={saving==="shift"} type="submit"><Repeat2 size={16}/>{saving==="shift"?"Saving…":"Add shift pattern"}</button>
      </form>

      <form className="card admin-mini-card" onSubmit={createLocation}>
        <div className="card-title"><div><h2>Locations</h2><p className="card-subtitle">Use locations for transfers between branches, offices, sites or regions.</p></div><Building2 size={19}/></div>
        <label>Location name<input name="name" placeholder="Gqeberha Office" required/></label>
        <label>Code <span className="muted">(optional)</span><input name="code" placeholder="GQE"/></label>
        <button className="btn primary" disabled={saving==="location"} type="submit"><Building2 size={16}/>{saving==="location"?"Saving…":"Add location"}</button>
      </form>
    </div>

    <form className="card remuneration-card" onSubmit={saveRemuneration}>
      <div className="card-title"><div><h2>Confidential remuneration</h2><p className="card-subtitle">Used to calculate a traceable annual-leave liability. Employees and ordinary managers cannot access this data.</p></div><Coins size={19}/></div>
      <div className="remuneration-grid">
        <label>Employee<select className="native-field" name="employee" required>{people.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label>Effective date<input className="native-field" name="effectiveFrom" type="date" required/></label>
        <label>Gross remuneration<input className="native-field" name="amount" type="number" min="0" step="0.01" required/></label>
        <label>Frequency<select className="native-field" name="frequency" defaultValue="monthly"><option value="monthly">Monthly</option><option value="annual">Annual</option><option value="weekly">Weekly</option><option value="daily">Daily</option><option value="hourly">Hourly</option></select></label>
        <label>Daily liability rate override <span className="muted">(optional)</span><input className="native-field" name="dailyRate" type="number" min="0" step="0.01"/></label>
        <label>Reason <span className="muted">(optional)</span><input className="native-field" name="reason"/></label>
      </div>
      <button className="btn primary" disabled={saving==="remuneration"} type="submit"><Coins size={16}/>{saving==="remuneration"?"Saving…":"Save remuneration"}</button>
    </form>
  </section>;
}
