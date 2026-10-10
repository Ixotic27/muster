const router=require('express').Router();
const crypto=require('crypto');
const {asyncHandler}=require('../utils/helpers');
function authenticateWorker(req,res,next){
 const secret=process.env.EMAIL_WORKER_SECRET;if(!secret)return res.status(503).json({success:false,message:'Worker is not configured'});
 const a=Buffer.from(req.get('authorization')||''),b=Buffer.from('Bearer '+secret);
 if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return res.status(401).json({success:false,message:'Not authorized'});
 res.set('Cache-Control','no-store');next();
}
router.get('/email',authenticateWorker,asyncHandler(async(req,res)=>res.json({success:true,...await require('../services/email-diagnostics.service').emailQueueMetadata()})));
router.post('/email',authenticateWorker,asyncHandler(async(req,res)=>{
 const worker=require('../services/email-worker.service');
 await worker.recoverPassesAndReminders();
 return res.json({success:true,...await worker.processEmailQueue()});
}));
module.exports=router;
