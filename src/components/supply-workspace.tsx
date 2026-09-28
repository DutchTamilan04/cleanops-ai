"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { performSupplyAction } from "@/app/supplies/actions";
import type { SupplyWorkspace } from "@/integrations/supplies/supabase-supplies";
import type { AccessSite, AppRole } from "@/services/access-context";
import { Alert, Button, CasinoSwitcher, DataTable, KpiCard, KpiCardGrid, SelectField, StatusBadge, TextField } from "@/components/ui";
import { readable, supplyStateLabel } from "@/config/equipment-labels";

type DraftItem = { itemId:string;packCount:string;baseUnitsPerPack:string;pricePerPack:string;
  priceSource:"supplier_quote"|"catalogue"|"invoice"|"manual_estimate";priceReference:string };
const blankItem = ():DraftItem=>({itemId:"",packCount:"1",baseUnitsPerPack:"1",pricePerPack:"0",
  priceSource:"manual_estimate",priceReference:""});
const money = (value:number)=>new Intl.NumberFormat("en-CA",{style:"currency",currency:"CAD"}).format(value);
const date = (value:string)=>new Date(value).toLocaleString("en-CA",{
  dateStyle:"medium",timeStyle:"short",timeZone:"America/Vancouver"});
const priceSources = <><option value="manual_estimate">Manual estimate</option><option value="supplier_quote">Supplier quote</option>
  <option value="catalogue">Catalogue</option><option value="invoice">Invoice</option></>;
const OPEN_STATES = ["requested","approved","ordered","partially_received"];

export function SupplyWorkspaceView({workspace,sites,siteId,month,role,userId}:{
  workspace:SupplyWorkspace;sites:AccessSite[];siteId:string;month:string;role:AppRole;userId:string;
}) {
  const router=useRouter();
  const [pending,startTransition]=useTransition();
  const [notice,setNotice]=useState<{ok:boolean;message:string}|null>(null);
  const [drafts,setDrafts]=useState<DraftItem[]>([blankItem()]);
  const [movementKind,setMovementKind]=useState("issue");
  const keys=useRef<Record<string,string>>({});
  const requestForm=useRef<HTMLFormElement>(null);
  const approver=["area_manager","operations_manager","organization_administrator"].includes(role);
  const director=role==="organization_administrator";
  const key=(name:string)=>keys.current[name]??=crypto.randomUUID();
  const run=(name:string,input:unknown)=>startTransition(async()=>{
    const result=await performSupplyAction(input);
    setNotice(result);
    if(result.ok){delete keys.current[name];if(name==="submit"){setDrafts([blankItem()]);requestForm.current?.reset();}router.refresh();}
  });
  const changeDraft=(index:number,field:keyof DraftItem,value:string)=>setDrafts(previous=>previous.map((entry,i)=>
    i===index?{...entry,[field]:value}:entry));
  const itemName=(id:string)=>workspace.options.find(option=>option.id===id)?.name??"Inventory item";
  const siteName=sites.find(site=>site.id===siteId)?.name??"Assigned casino";
  const openRequests=workspace.requests.filter(request=>OPEN_STATES.includes(request.state)).length;
  const awaitingApproval=workspace.requests.filter(request=>request.state==="requested").length;
  const awaitingReceipt=workspace.requests.filter(request=>["ordered","partially_received"].includes(request.state)).length;
  const stockReview=workspace.stock.filter(stock=>stock.on_hand===null).length;
  return <div className="pageStack supplyWorkspace">
    <header className="financeHeader">
      <div>
        <p className="eyebrow">Operational supplies · {siteName}</p>
        <h1>Supply requests and stock</h1>
        <p>Request supplies, approve and order them, record what arrives, and keep site stock accurate.</p>
      </div>
      <StatusBadge tone={approver?"info":"neutral"}>{director?"Director":approver?"Manager · can approve":"Supervisor · can request"}</StatusBadge>
    </header>
    {sites.length>1?<section className="siteScopeBar" aria-label="Casino scope">
      <div><p className="eyebrow">Casino scope</p><strong>{siteName}</strong></div>
      <form method="get"><input type="hidden" name="month" value={month}/>
        <CasinoSwitcher name="siteId" sites={sites} selectedId={siteId} label="Choose casino"/>
        <Button type="submit" variant="secondary">Open casino</Button></form>
    </section>:null}
    {notice?<Alert tone={notice.ok?"success":"danger"}>{notice.message}</Alert>:null}
    {pending?<Alert tone="pending">Saving supply record…</Alert>:null}
    <KpiCardGrid>
      <KpiCard variant="hero" label="Open requests" value={openRequests} help="Requested, approved, ordered or part received"/>
      <KpiCard label="Awaiting approval" value={awaitingApproval} help={approver?"Needs a manager decision":"Waiting on a manager"}/>
      <KpiCard label="Awaiting receipt" value={awaitingReceipt} help="Ordered, not fully received"/>
      <KpiCard label="Stock lines to review" value={stockReview} help="N/A balance from a legacy movement"/>
    </KpiCardGrid>
    <Alert tone="info">Synthetic demo records. Requested and approved amounts are estimates. A receipt changes stock; only a separately approved expense posting contributes an operational supply cost. Accounting recognition and reconciliation remain in Finance. Issued stock is not labelled consumption.</Alert>

    <section className="assetSection" aria-labelledby="supply-requests-title">
      <div className="financePanel">
        <div className="panelHeading"><h2 id="supply-requests-title">Requests and decisions</h2><StatusBadge tone="neutral">{workspace.requests.length} total</StatusBadge></div>
        {workspace.requests.length?<div className="requestList">{workspace.requests.map(request=>{
          const items=workspace.items.filter(item=>item.request_id===request.id);
          const canChange=request.requested_by===userId||approver;
          const state=supplyStateLabel(request.state);
          const approvedStage=["approved","ordered","partially_received","received"].includes(request.state);
          const orderedStage=["ordered","partially_received","received"].includes(request.state);
          return <article key={request.id} className="requestCard" aria-labelledby={`request-${request.id}`}>
            <div className="requestCard-head">
              <h3 id={`request-${request.id}`}>{request.purpose}</h3>
              <StatusBadge tone={state.tone}>{state.label}</StatusBadge>
            </div>
            <p className="historyList-meta"><time>{date(request.created_at)}</time><span>Version {request.version}</span>
              <span>Contract supplies: {readable(request.supply_responsibility)}</span>{request.order_reference?<span>Order {request.order_reference}</span>:null}</p>
            <p className="requestCard-total">Requested estimate <strong>{money(items.reduce((sum,item)=>sum+item.requested_amount,0))}</strong><span>Approved expense posting is a separate Director action.</span></p>
            {items.map(item=>{
              const remaining=item.base_quantity-item.received_base_quantity;
              return <div key={item.id} className="requestItem">
                <div className="requestItem-head"><strong>{itemName(item.inventory_item_id)}</strong>
                  <span>{item.pack_count} packs × {item.base_units_per_pack} base units · {money(item.price_per_pack)} per pack from {readable(item.price_source)}{item.price_reference?` (${item.price_reference})`:""}</span></div>
                <dl className="requestItem-qty">
                  <div><dt>Requested</dt><dd>{item.base_quantity}</dd></div>
                  <div><dt>Approved</dt><dd>{approvedStage?item.base_quantity:0}</dd></div>
                  <div><dt>Ordered</dt><dd>{orderedStage?item.base_quantity:0}</dd></div>
                  <div><dt>Received</dt><dd>{item.received_base_quantity}</dd></div>
                </dl>
                {canChange&&["requested","approved"].includes(request.state)?<form onSubmit={event=>{
                  event.preventDefault();const form=new FormData(event.currentTarget);
                  run(`revise:${item.id}`,{kind:"revise",itemId:item.id,item:{itemId:String(form.get("itemId")),
                    packCount:Number(form.get("packCount")),baseUnitsPerPack:Number(form.get("factor")),
                    pricePerPack:Number(form.get("price")),priceSource:String(form.get("source")),
                    priceReference:String(form.get("reference"))}});
                }}><details className="ui-disclosure"><summary>Revise item · resets approval</summary>
                  <div className="ui-fieldGrid">
                    <SelectField label="Item" name="itemId" defaultValue={item.inventory_item_id}>{workspace.options.map(option=><option key={option.id} value={option.id}>{option.name}</option>)}</SelectField>
                    <TextField label="Packs" name="packCount" type="number" min="0.001" step="0.001" defaultValue={item.pack_count} required/>
                    <TextField label="Base units per pack" name="factor" type="number" min="0.001" step="0.001" defaultValue={item.base_units_per_pack} required/>
                    <TextField label="CAD per pack" name="price" type="number" min="0" step="0.01" defaultValue={item.price_per_pack} required/>
                    <SelectField label="Price source" name="source" defaultValue={item.price_source}>{priceSources}</SelectField>
                    <TextField label="Price reference" name="reference" defaultValue={item.price_reference??""}/>
                  </div>
                  <Button type="submit" disabled={pending} variant="secondary">Save revision</Button>
                </details></form>:null}
                {["ordered","partially_received"].includes(request.state)&&remaining>0?<form className="inlineForm" onSubmit={event=>{
                  event.preventDefault();const form=new FormData(event.currentTarget);
                  run(`receipt:${item.id}`,{kind:"receive",requestItemId:item.id,baseQuantity:Number(form.get("quantity")),receiptKey:key(`receipt:${item.id}`)});
                }}><TextField label={`Receive base units, up to ${remaining}`} name="quantity" type="number" min="0.001" max={remaining} step="0.001" required/>
                  <Button type="submit" disabled={pending} variant="primary">Record receipt</Button></form>:null}
              </div>;
            })}
            {approver&&request.state==="requested"?<form className="inlineForm" onSubmit={event=>{
              event.preventDefault();const form=new FormData(event.currentTarget);
              run(`decision:${request.id}`,{kind:"decide",requestId:request.id,decision:String(form.get("decision")),reason:String(form.get("reason"))});
            }}><SelectField label="Decision" name="decision"><option value="approved">Approve</option><option value="rejected">Reject</option></SelectField>
              <TextField label="Reason" name="reason" maxLength={500}/>
              <Button type="submit" disabled={pending} variant="primary">Record decision</Button></form>:null}
            {approver&&request.state==="approved"?<form className="inlineForm" onSubmit={event=>{
              event.preventDefault();const form=new FormData(event.currentTarget);
              run(`order:${request.id}`,{kind:"order",requestId:request.id,orderReference:String(form.get("reference"))});
            }}><TextField label="Order reference" name="reference" minLength={3} maxLength={160} required/>
              <Button type="submit" disabled={pending} variant="primary">Mark ordered</Button></form>:null}
            {canChange&&["requested","approved","ordered"].includes(request.state)?<form onSubmit={event=>{
              event.preventDefault();const form=new FormData(event.currentTarget);
              run(`cancel:${request.id}`,{kind:"cancel",requestId:request.id,reason:String(form.get("reason"))});
            }}><details className="ui-disclosure"><summary>Cancel this request</summary><div className="inlineForm">
              <TextField label="Cancellation reason" name="reason" minLength={3} maxLength={500} required/>
              <Button type="submit" disabled={pending} variant="danger">Cancel request</Button></div></details></form>:null}
            <details className="ui-disclosure"><summary>Audit trail</summary><ol className="historyList">{workspace.events.filter(event=>event.request_id===request.id)
              .map(event=><li key={event.id}><div className="historyList-meta"><time>{date(event.created_at)}</time><span>{readable(event.event_kind)}</span></div></li>)}</ol></details>
          </article>;
        })}</div>:<p className="panelIntro">No supply requests for this site yet.</p>}
      </div>

      <div className="assetSection-actions">
        <form ref={requestForm} className="actionCard" aria-labelledby="supply-request-title" onSubmit={event=>{
          event.preventDefault();const form=new FormData(event.currentTarget);
          run("submit",{kind:"submit",siteId,purpose:String(form.get("purpose")),requestKey:key("submit"),
            items:drafts.map(entry=>({itemId:entry.itemId,packCount:Number(entry.packCount),
              baseUnitsPerPack:Number(entry.baseUnitsPerPack),pricePerPack:Number(entry.pricePerPack),
              priceSource:entry.priceSource,priceReference:entry.priceReference||undefined}))});
        }}>
          <h3 id="supply-request-title">Request supplies</h3>
          <p>Each item records pack count, base-unit conversion and where its price came from. A manager must approve before ordering. A partial receipt may record only the remaining ordered quantity; an over-receipt is refused.</p>
          <TextField label="Purpose" name="purpose" required minLength={3} maxLength={500}/>
          {drafts.map((entry,index)=><fieldset key={index} className="actionCard-steps"><legend>Item {index+1}</legend>
            <SelectField label="Catalogue item" required value={entry.itemId} onChange={event=>changeDraft(index,"itemId",event.target.value)}>
              <option value="">Select an item</option>{workspace.options.map(option=><option key={option.id} value={option.id}>
                {option.name} · {option.sku??"no SKU"} · base unit {option.unit_of_measure}</option>)}</SelectField>
            <div className="ui-fieldGrid">
              <TextField label="Packs requested" type="number" min="0.001" step="0.001" required value={entry.packCount}
                onChange={event=>changeDraft(index,"packCount",event.target.value)}/>
              <TextField label="Base units per pack" type="number" min="0.001" step="0.001" required value={entry.baseUnitsPerPack}
                onChange={event=>changeDraft(index,"baseUnitsPerPack",event.target.value)}/>
              <TextField label="CAD per pack" type="number" min="0" step="0.01" required value={entry.pricePerPack}
                onChange={event=>changeDraft(index,"pricePerPack",event.target.value)}/>
              <SelectField label="Price source" value={entry.priceSource} onChange={event=>changeDraft(index,"priceSource",event.target.value)}>{priceSources}</SelectField>
            </div>
            <TextField label="Price reference" maxLength={200} required={entry.priceSource!=="manual_estimate"}
              value={entry.priceReference} onChange={event=>changeDraft(index,"priceReference",event.target.value)}/>
            <p className="requestCard-total">{Number(entry.packCount||0)*Number(entry.baseUnitsPerPack||0)} base units · estimate <strong>{money(Number(entry.packCount||0)*Number(entry.pricePerPack||0))}</strong></p>
            {drafts.length>1?<Button type="button" variant="ghost"
              onClick={()=>setDrafts(previous=>previous.filter((_,i)=>i!==index))}>Remove item</Button>:null}
          </fieldset>)}
          <div className="ui-buttonRow">
            <Button type="button" variant="secondary" disabled={drafts.length>=20}
              onClick={()=>setDrafts(previous=>[...previous,blankItem()])}>Add item</Button>
            <Button type="submit" variant="primary" disabled={pending||!workspace.options.length}>Submit request</Button>
          </div>
        </form>
      </div>
    </section>

    <section className="assetSection" aria-labelledby="stock-title">
      <div className="financePanel">
        <div className="panelHeading"><h2 id="stock-title">Site stock</h2><StatusBadge tone="neutral">{workspace.stock.length} items</StatusBadge></div>
        <p className="panelIntro">{workspace.history.length?`Latest recorded movement: ${date(workspace.history[0].occurred_at)}.`:"No stock movement has been recorded for this site."} N/A means a legacy movement needs review.</p>
        <DataTable caption="On-hand stock by item" rows={workspace.stock} getRowKey={stock=>stock.inventory_item_id}
          emptyMessage="No stock items recorded for this site."
          columns={[
            {key:"item",header:"Item",render:stock=><strong>{stock.item_name}</strong>},
            {key:"unit",header:"Base unit",render:stock=>stock.unit_of_measure},
            {key:"onHand",header:"On hand",align:"right",render:stock=>stock.on_hand===null?<StatusBadge tone="pending">N/A</StatusBadge>:stock.on_hand},
          ]}/>
        <details className="ui-disclosure"><summary>How on hand is calculated</summary><p className="panelIntro">On hand = opening + receipts + transfers in + returns + positive count adjustments − issues − transfers out − negative count adjustments. Issues and transfers cannot make stock negative.</p></details>
        <details className="ui-disclosure"><summary>Recent stock history (up to 100 movements)</summary><ol className="historyList">{workspace.history.map(entry=><li key={entry.id}>
          <div className="historyList-meta"><time>{date(entry.occurred_at)}</time><strong>{itemName(entry.inventory_item_id)}</strong><span>{readable(entry.transaction_type)} {entry.quantity}</span></div>
          <p className="historyList-body">{entry.notes??"No note"}</p></li>)}</ol></details>
      </div>
      <div className="assetSection-actions">
        <form className="actionCard" aria-labelledby="stock-action-title" onSubmit={event=>{
          event.preventDefault();const form=new FormData(event.currentTarget);
          run("movement",{kind:"movement",siteId,itemId:String(form.get("item")),movementKind:String(form.get("kind")),
            quantity:Number(form.get("quantity")),key:key("movement"),reason:String(form.get("reason")),
            targetSiteId:String(form.get("target"))||undefined});
        }}>
          <h3 id="stock-action-title">Record a stock action</h3>
          <SelectField label="Stock action" name="kind" value={movementKind} onChange={event=>setMovementKind(event.target.value)}>
            <option value="opening">Opening balance</option><option value="issue">Issue to site</option><option value="return">Return to stock</option>
            <option value="transfer">Transfer to another site</option><option value="count">Count and adjust</option></SelectField>
          <SelectField label="Item" name="item" required><option value="">Select</option>{workspace.options.map(option=><option key={option.id} value={option.id}>{option.name}</option>)}</SelectField>
          <TextField label={movementKind==="count"?"Counted base units":"Base units"} name="quantity" type="number" min={movementKind==="count"?"0":"0.001"} step="0.001" required/>
          {movementKind==="transfer"?<SelectField label="Target site" name="target" required><option value="">Select</option>{sites.filter(site=>site.id!==siteId).map(site=><option key={site.id} value={site.id}>{site.name}</option>)}</SelectField>:null}
          <TextField label="Reason" name="reason" minLength={3} maxLength={500} required/>
          <Button type="submit" disabled={pending} variant="primary">Record stock action</Button>
        </form>
      </div>
    </section>

    {approver?<section className="financePanel" aria-labelledby="comparison-title">
      <div className="panelHeading"><h2 id="comparison-title">Site and item comparison</h2>
        <form method="get" className="inlineForm"><input type="hidden" name="siteId" value={siteId}/>
          <TextField label="Month" name="month" type="month" defaultValue={month} required/><Button variant="secondary" type="submit">Compare</Button></form></div>
      <p className="panelIntro">Live site records. Requested/currently approved estimates use the request date; received units use the receipt date; linked approved expense uses the claim date. Accounting reconciliation remains in Finance. The denominator is approved labour hours in the selected month. N/A is not zero.</p>
      <DataTable caption="Supply cost by site and item" rows={workspace.comparison} getRowKey={row=>`${row.site_id}:${row.inventory_item_id}`}
        emptyMessage="No requests in this month for assigned sites."
        columns={[
          {key:"site",header:"Site",render:row=><strong>{sites.find(site=>site.id===row.site_id)?.name??"Assigned site"}</strong>},
          {key:"item",header:"Item",render:row=>row.item_name},
          {key:"requested",header:"Requested",align:"right",render:row=>money(row.requested_amount)},
          {key:"approved",header:"Approved",align:"right",render:row=>money(row.approved_amount)},
          {key:"received",header:"Received units",align:"right",render:row=>row.received_base_quantity},
          {key:"expense",header:"Approved expense",align:"right",render:row=>money(row.approved_expense)},
          {key:"hours",header:"Approved hours",align:"right",render:row=>row.approved_labour_hours??"N/A"},
          {key:"perHour",header:"Expense per hour",align:"right",render:row=>row.expense_per_approved_hour===null?"N/A":money(row.expense_per_approved_hour)},
        ]}/>
    </section>:null}

    {director?<section className="financePanel" aria-labelledby="expense-link-title">
      <div className="panelHeading"><h2 id="expense-link-title">Link approved supply expense</h2><StatusBadge tone="info">Director</StatusBadge></div>
      <p className="panelIntro">The link identifies the financial source for a receipt. It does not create another posting or supplier payment.</p>
      {workspace.receipts.filter(receipt=>!workspace.links.some(link=>link.receipt_id===receipt.id)).map(receipt=><form key={receipt.id} className="inlineForm" onSubmit={event=>{
        event.preventDefault();const form=new FormData(event.currentTarget);
        run(`link:${receipt.id}`,{kind:"link_expense",receiptId:receipt.id,expensePostingId:String(form.get("posting"))});
      }}><SelectField label={`Receipt ${receipt.id.slice(0,8)} · ${receipt.base_quantity} base units`} name="posting" required><option value="">Select approved posting</option>
        {workspace.expenses.filter(expense=>!workspace.links.some(link=>link.expense_posting_id===expense.id)).map(expense=><option key={expense.id} value={expense.id}>
          {date(expense.posted_at)} · {expense.currency} {expense.amount.toFixed(2)} · {expense.id.slice(0,8)}</option>)}</SelectField>
        <Button type="submit" disabled={pending} variant="secondary">Link source</Button></form>)}
      {!workspace.receipts.length?<p className="panelIntro">No received supply orders to link.</p>:null}
    </section>:null}
  </div>;
}
