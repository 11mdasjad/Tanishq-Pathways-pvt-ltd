'use client';
import {useState, type ReactNode} from 'react';
import {ArrowLeft, Plus, RefreshCw, Search} from 'lucide-react';
type Row = Record<string, any>;
type Props = {
 employee: Row; data: Row; busy: boolean;
 back: () => void; refresh: () => void; modal: (value: Row) => void;
 act: (payload: Row, message?: string) => Promise<any>;
 leads: (rows: Row[]) => ReactNode;
 records: (type: string, rows: Row[]) => ReactNode;
 timeline: (rows: Row[]) => ReactNode;
};
const formatDate = (value: string) => value ? new Date(value.length === 10 ? `${value}T12:00:00+05:30` : value).toLocaleDateString('en-IN', {day:'2-digit',month:'short',year:'numeric',timeZone:'Asia/Kolkata'}) : '—';
export default function EmployeeManagement({employee,data,busy,back,refresh,modal,act,leads,records,timeline}: Props) {
 const [tab,setTab]=useState('Assigned work');
 const [search,setSearch]=useState('');
 const [status,setStatus]=useState('All tasks');
 const [showTrash,setShowTrash]=useState(false);
 const [assigning,setAssigning]=useState(false);
 const ownLeads: Row[]=data.leads.filter((l:Row)=>l.assigned===employee.id);
 const active=ownLeads.filter(l=>!l.archived);
 const leadIds=new Set(ownLeads.map(l=>l.id));
 const tasks: Row[]=data.tasks.filter((t:Row)=>t.assigned===employee.id);
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const overdue=(task:Row)=>task.status!=='Completed'&&task.due_date<today;
 const matches=(value:string)=>value.toLowerCase().includes(search.trim().toLowerCase());
 const visibleTasks=tasks.filter(t=>matches(`${t.title} ${t.notes}`)&&(status==='All tasks'||(status==='Overdue'?overdue(t):t.status===status)));
 const related: Record<string,Row[]>={
  Documents:data.documents.filter((r:Row)=>leadIds.has(r.lead_id)&&r.kind==='document'),
  Agreements:data.agreements.filter((r:Row)=>leadIds.has(r.lead_id)),
  Payments:data.payments.filter((r:Row)=>leadIds.has(r.lead_id)),
  Appointments:data.appointments.filter((r:Row)=>leadIds.has(r.lead_id)),
 };
 return <div className="employee-management">
  <button className="back-link" onClick={back}><ArrowLeft size={15}/>Back to employees</button>
  <div className="page-heading"><div><div className="eyebrow">EMPLOYEE MANAGEMENT</div><h1>{employee.name}</h1><p>{employee.username||employee.email} · {employee.active?'Active employee':'Deactivated employee'}</p><p className="muted">{employee.email}</p></div><div className="heading-actions">
   <button className="button" disabled={busy} onClick={refresh}><RefreshCw size={15}/>Refresh</button>
   <button className="button" disabled={busy} onClick={()=>modal({type:'employee',employee})}>Account & access</button>
   <button className="primary" disabled={busy||!employee.active} onClick={()=>modal({type:'task',title:'Assign a task',assigned:employee.id})}><Plus size={16}/>Assign task</button>
  </div></div>
  {!employee.active&&<div className="notice">This account is deactivated. Existing work remains visible and can be reassigned. Reactivate the account to assign new work.</div>}
  <div className="stat-grid">{[
   ['Assigned applicants',active.length],['Open tasks',tasks.filter(t=>t.status!=='Completed').length],['Overdue tasks',tasks.filter(overdue).length],['Completed tasks',tasks.filter(t=>t.status==='Completed').length]
  ].map(([label,value])=><div className="stat-card report-stat" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
  <div className="tabbar" aria-label="Employee work sections">{['Assigned work',...Object.keys(related),'Activity'].map(name=><button key={name} className={tab===name?'active':''} onClick={()=>setTab(name)}>{name}{related[name]?` (${related[name].length})`:''}</button>)}</div>
  {tab==='Assigned work'?<>
   <section className="panel"><div className="panel-heading"><div><h3>Assigned tasks <span className="count">{tasks.length}</span></h3><p>Instructions, deadlines and progress for this employee.</p></div></div>
    <div className="filter-bar"><div className="input-search"><Search size={16}/><input aria-label="Search employee work" placeholder="Search tasks or applicants…" value={search} onChange={e=>setSearch(e.target.value)}/></div><select aria-label="Filter employee tasks" value={status} onChange={e=>setStatus(e.target.value)}>{['All tasks','To do','In progress','Completed','Overdue'].map(s=><option key={s}>{s}</option>)}</select></div>
    {visibleTasks.length?<div className="employee-task-list">{visibleTasks.map(task=><article className="work-task" key={task.id}>
     <div className="employee-task-heading"><h3>{task.title}</h3><span className={`badge ${overdue(task)?'red':task.status==='Completed'?'green':'blue'}`}>{overdue(task)?'Overdue':task.status}</span></div>
     <p>{task.notes||'No additional instructions.'}</p><p className="muted">Due {formatDate(task.due_date)} · Assigned {formatDate(task.created_at)}</p>
     <div className="employee-task-actions"><label className="field"><span>Status</span><select aria-label={`Status for ${task.title}`} disabled={busy} value={task.status} onChange={e=>act({action:'taskStatus',taskId:task.id,status:e.target.value},'Task progress saved')}>{['To do','In progress','Completed'].map(s=><option key={s}>{s}</option>)}</select></label><button className="button" disabled={busy} onClick={()=>modal({type:'task',title:'Edit assigned task',task})}>Edit / reassign</button></div>
    </article>)}</div>:<div className="empty"><h3>{tasks.length?'No matching tasks':'No tasks assigned yet'}</h3><p>{tasks.length?'Change the search or status filter to see other tasks.':'Use Assign task to add work for this employee.'}</p></div>}
   </section>
   <section className="panel"><div className="panel-heading"><div><h3>Assigned leads & prospects <span className="count">{ownLeads.filter(l=>!!l.archived===showTrash).length}</span></h3><p>Open any applicant to manage documents, verification, agreements, payments and case progress.</p></div><div className="heading-actions"><button className="button small" onClick={()=>setShowTrash(!showTrash)}>{showTrash?'Show active records':`Trash (${ownLeads.length-active.length})`}</button><button className="button small" disabled={busy||!employee.active} onClick={()=>setAssigning(!assigning)}>Assign existing record</button></div></div>
    {assigning&&<form className="employee-assign-form" onSubmit={async e=>{e.preventDefault();const leadId=new FormData(e.currentTarget).get('leadId');if(await act({action:'assignLead',leadId,assigned:employee.id},'Record assigned to employee'))setAssigning(false);}}><label className="field"><span>Select a lead or prospect to transfer to {employee.name}</span><select name="leadId" required defaultValue="" disabled={busy}><option value="" disabled>Select a record</option>{data.leads.filter((l:Row)=>!l.archived&&l.assigned!==employee.id).map((l:Row)=><option key={l.id} value={l.id}>{l.name} · {l.id} · Currently: {l.employee}</option>)}</select></label><button className="primary" disabled={busy}>Assign record</button><button type="button" className="button" onClick={()=>setAssigning(false)}>Cancel</button></form>}
    {ownLeads.some(l=>!!l.archived===showTrash&&matches(`${l.name} ${l.id} ${l.mobile} ${l.email}`))?leads(ownLeads.filter(l=>!!l.archived===showTrash&&matches(`${l.name} ${l.id} ${l.mobile} ${l.email}`))):<div className="empty"><h3>No {showTrash?'archived':'matching'} records</h3><p>{search?'Try another search.':'Assigned leads and prospects will appear here.'}</p></div>}
   </section>
  </>:tab==='Activity'?<section className="panel"><div className="panel-heading"><div><h3>Employee activity</h3><p>Actions by this employee from the latest 100 workspace events.</p></div></div>{timeline(data.activities.filter((a:Row)=>a.actor===employee.id))}</section>:<section className="panel"><div className="panel-heading"><div><h3>{tab}</h3><p>Records linked to this employee’s assigned applicants, including Trash.</p></div></div>{records(tab,related[tab]||[])}</section>}
 </div>;
}
