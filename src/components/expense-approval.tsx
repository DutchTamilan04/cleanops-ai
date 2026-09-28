"use client";
import { useRouter } from "next/navigation";
import { useState,useTransition } from "react";
import { approveExpense } from "@/app/finance/expenses/actions";
import { Alert, ConfirmAction } from "@/components/ui";
export function ExpenseApproval({claimId}:{claimId:string}){
  const router=useRouter();const [pending,startTransition]=useTransition();const [notice,setNotice]=useState<{ok:boolean;message:string}|null>(null);
  return <div className="expenseApproval"><ConfirmAction label="Director approve and post" disabled={pending}
    title="Approve and post this expense?"
    consequence="Posting creates an immutable direct-cost posting for each allocation of this claim. It cannot be edited afterwards."
    confirmLabel="Approve and post"
    onConfirm={()=>startTransition(async()=>{
    const result=await approveExpense(claimId);setNotice(result);router.refresh();
  })} />{notice&&<Alert tone={notice.ok?"success":"danger"}>{notice.message}</Alert>}</div>;
}
