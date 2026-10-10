const nodemailer = require('nodemailer');
const {createHash}=require('node:crypto');
const transports=new Map();
const mailbox=value=>typeof value==='string'&&/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value);
const getEmailProvider=()=>String(process.env.EMAIL_PROVIDER||'disabled').trim().toLowerCase();
function getSenders(){
 if(getEmailProvider()!=='smtp')return [];
 const host=String(process.env.SMTP_HOST||'').trim(),port=Number(process.env.SMTP_PORT||587),email=process.env.EMAIL_FROM_ADDRESS?.trim(),replyTo=process.env.EMAIL_REPLY_TO?.trim()||email;
 if(!/^[a-z0-9.-]+$/i.test(host)||!host.includes('.')||![465,587,2525].includes(port)||!process.env.SMTP_USERNAME||!process.env.SMTP_PASSWORD||!mailbox(email)||!mailbox(replyTo))return [];
 return [{id:'smtp',provider:'smtp',host,port,email,replyTo,login:process.env.SMTP_USERNAME,password:process.env.SMTP_PASSWORD}];
}
function getEmailTransporter(sender=getSenders()[0]){
 if(!sender)return null;
 const options={host:sender.host,port:sender.port,secure:sender.port===465,...(sender.port!==465?{requireTLS:true,ignoreTLS:false}:{}),auth:{user:sender.login,pass:sender.password},connectionTimeout:5000,greetingTimeout:5000,socketTimeout:10000,disableFileAccess:true,disableUrlAccess:true};
 const key=createHash('sha256').update(JSON.stringify(options)).digest('hex');
 if(!transports.has(key))transports.set(key,nodemailer.createTransport(options));return transports.get(key);
}
module.exports={getSenders,getEmailTransporter,getEmailProvider};
