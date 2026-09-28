"use client";

import { useState,useTransition } from "react";
import { submitAppExpense } from "@/app/mobile/expenses/actions";
import { ExpenseReceiptUploader } from "@/components/expense-receipt-uploader";
import { Alert, Button, SelectField } from "@/components/ui";

export function ExpenseSubmission({sites}:{sites:{id:string;name:string}[]}){
  const [siteId,setSiteId]=useState(sites[0]?.id??"");
  const [details,setDetails]=useState("");
  const [intakeId,setIntakeId]=useState<string|null>(null);
  const [notice,setNotice]=useState<{message:string;ok:boolean}|null>(null);
  const [pending,startTransition]=useTransition();
  function submit(){
    startTransition(async()=>{
      const result=await submitAppExpense({siteId,text:details});
      setNotice({message:result.message,ok:result.ok});
      if(result.ok)setIntakeId(result.intakeId);
    });
  }
  return <section className="mobileExpensePanel">
    <p>Describe the expense and attach its receipt. Finance will verify site, category and amount before posting.</p>
    <SelectField label="Casino" value={siteId} onChange={event=>setSiteId(event.target.value)}>
      {sites.map(site=><option key={site.id} value={site.id}>{site.name}</option>)}
    </SelectField>
    <label className="ui-field"><span className="ui-field-label">Expense details</span><textarea className="ui-field-input" value={details} onChange={event=>setDetails(event.target.value)}
      placeholder="Expense: fuel; Vendor: Demo Fuel; Date: 2026-09-01; Total: CAD $42.00; Payment: employee personal"/></label>
    {!intakeId&&<Button variant="primary" type="button" disabled={pending||!siteId||details.trim().length<4} onClick={submit}>Submit expense</Button>}
    {notice&&<Alert tone={notice.ok?"success":"danger"}>{notice.message}</Alert>}
    {intakeId&&<ExpenseReceiptUploader intakeId={intakeId}/>}
  </section>;
}
