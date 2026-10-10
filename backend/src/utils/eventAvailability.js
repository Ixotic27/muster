function registrationAvailability(event,now=Date.now()){
 const capacityUnit=['team','both'].includes(event?.participationType)?'teams':'participants',capacity=event?.maxSlots??null,filled=event?.filledSlots??0,remaining=capacity==null?null:Math.max(capacity-filled,0);
 const result=(open,reason,message)=>({open,reason,message,capacityUnit,capacity,filled,remaining});
 if(!event||event.status==='draft')return result(false,'not_published','Event registration is unavailable');
 if(event.status==='closed')return result(false,'manual_closed','This event is not accepting more responses');
 if(event.status!=='published')return result(false,'cancelled','This event is unavailable');
 const start=new Date(event.eventDate).getTime(),deadline=new Date(event.registrationDeadline||event.eventDate).getTime();
 if(![start,deadline,Number(now)].every(Number.isFinite))return result(false,'invalid_date','Registration dates are unavailable');
 if(start<=now)return result(false,'event_started','This event has started');
 if(deadline<=now)return result(false,'deadline_passed','Registration has closed');
 if(!Number.isSafeInteger(filled)||filled<0||(capacity!==null&&(!Number.isSafeInteger(capacity)||capacity<1)))return result(false,'invalid_capacity','Capacity is unavailable');
 if(remaining===0)return result(false,'capacity_full','This event is full');
 return result(true,'open','Registration is open');
}
const registrationIsOpen=(event,now)=>registrationAvailability(event,now).open;
module.exports={registrationAvailability,registrationIsOpen};
