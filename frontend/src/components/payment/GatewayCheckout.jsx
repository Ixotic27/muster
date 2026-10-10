import React, { useRef, useState } from 'react';
import { api } from '../../utils/api';
import { Notice, money } from '../common/Portal';
import { site } from '../../config';
let scriptPromise;
export function loadCheckout() {
  if(window.Razorpay) return Promise.resolve();
  if(scriptPromise) return scriptPromise;
  scriptPromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='https://checkout.razorpay.com/v1/checkout.js';script.async=true;
    const timer=setTimeout(()=>{script.remove();scriptPromise=null;reject(new Error('Checkout took too long to load. Please try again.'));},15000);
    script.onload=()=>{clearTimeout(timer);if(window.Razorpay)resolve();else{scriptPromise=null;reject(new Error('Checkout is unavailable.'));}};
    script.onerror=()=>{clearTimeout(timer);script.remove();scriptPromise=null;reject(new Error('Could not load checkout. Check your connection and try again.'));};
    document.head.appendChild(script);
  });return scriptPromise;
}
export default function GatewayCheckout({registration,user,onConfirmed,enabled,testMode}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const active=useRef(false),verifying=useRef(false);
  async function begin(){if(active.current||!enabled)return;active.current=true;setBusy(true);setError('');setMessage('');
    try{await loadCheckout();const result=await api('/payments/gateway/orders',{method:'POST',body:{registrationId:registration._id}});
      const checkout=new window.Razorpay({key:result.keyId,order_id:result.order.id,amount:result.order.amount,currency:result.order.currency,name:site.name,description:registration.eventId?.name||'Event registration',prefill:{name:user.name,email:user.email,contact:user.phone||''},theme:{color:'#173bc7'},modal:{ondismiss:()=>{if(active.current&&!verifying.current){active.current=false;setBusy(false);setMessage('Checkout closed. Your registration is still saved.');}}},handler:async response=>{
        if(verifying.current)return;
        verifying.current=true;
        setMessage('Checking your payment with the server…');
        try{const verified=await api('/payments/gateway/verify',{method:'POST',body:{registrationId:registration._id,razorpay_order_id:response.razorpay_order_id,razorpay_payment_id:response.razorpay_payment_id,razorpay_signature:response.razorpay_signature}});setMessage(verified.message||'Payment confirmed. Your registration has been updated.');await onConfirmed();}
        catch(e){setError(e.message+' If money was debited, refresh your registration before paying again. The gateway notification can confirm it separately.');setMessage('');}
        finally{verifying.current=false;active.current=false;setBusy(false);}
      }});
      checkout.on('payment.failed',response=>{if(verifying.current)return;setError(response.error?.description||'Payment was not completed. Check your bank transaction before trying again.');active.current=false;setBusy(false);});checkout.open();
    }catch(e){active.current=false;setBusy(false);setError(e.message);}
  }
  return <section className="portal-card"><span className="eyebrow">Secure gateway checkout</span><h2>Confirm your place.</h2><p>Pay {money(registration.feeSnapshotInr)} through Razorpay. The server confirms the payment before issuing your entry pass.</p>{testMode&&<Notice success>Test mode: use the payment provider’s test details. No real payment is collected.</Notice>}<Notice>{error}</Notice><Notice success>{message}</Notice>{enabled?<button className="primary-button" type="button" disabled={busy} onClick={begin}>{busy?'Waiting for payment…':'Continue to checkout'}</button>:<p>The organizer has not enabled gateway payments.</p>}</section>;
}
