require('dotenv').config();
const {Event}=require('../models');
const {connectDatabase,disconnectDatabase}=require('../config/database');
async function seedEvents(){
 if(process.env.NODE_ENV==='production'||process.env.ALLOW_SAMPLE_SEED!=='true')throw new Error('Sample seeding requires ALLOW_SAMPLE_SEED=true in development');
 const date=new Date(Date.now()+30*86400000),deadline=new Date(date.getTime()-86400000);
 const samples=[{slug:'design-sprint',name:'Design Sprint',description:'A collaborative design challenge.',category:'technical',participationType:'team',minTeamSize:2,maxTeamSize:4,feeInr:100,venue:'Workshop Hall',maxSlots:50},{slug:'community-workshop',name:'Community Workshop',description:'Learn, meet and build together.',category:'non_technical',participationType:'solo',minTeamSize:1,maxTeamSize:1,feeInr:0,venue:'Main Hall',maxSlots:100}];
 for(const event of samples)await Event.updateOne({slug:event.slug},{$setOnInsert:{...event,eventDate:date,registrationDeadline:deadline,status:'published'}},{upsert:true});return samples.length;
}
if(require.main===module)connectDatabase().then(seedEvents).then(n=>console.log('Prepared '+n+' sample events')).catch(e=>{console.error(e.message);process.exitCode=1;}).finally(disconnectDatabase);
module.exports={seedEvents};
