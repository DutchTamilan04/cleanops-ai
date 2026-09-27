"use client";
import { useRouter } from "next/navigation";
import { useState,useTransition } from "react";
import { approveExpense } from "@/app/finance/expenses/actions";
import { Alert, Button } from "@/components/ui";
export function ExpenseApproval({claimId}:{claimId:string}){
  const router=useRouter();const [pending,startTransition]=useTransition();const [notice,setNotice]=useState<{ok:boolean;message:string}|null>(null);
  return <div className="expenseApproval"><Button variant="primary" type="button" disabled={pending} onClick={()=>startTransition(async()=>{
    const result=await approveExpense(claimId);setNotice(result);router.refresh();
  })}>Director approve and post</Button>{notice&&<Alert tone={notice.ok?"success":"danger"}>{notice.message}</Alert>}</div>;
}
