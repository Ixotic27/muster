require('dotenv').config();
const {User}=require('../src/models');
const {connectDatabase,disconnectDatabase}=require('../src/config/database');
async function main(){
 const email=String(process.env.BOOTSTRAP_ADMIN_EMAIL||'').trim().toLowerCase();if(!email||!email.includes('@'))throw new Error('Set BOOTSTRAP_ADMIN_EMAIL to your existing account email');
 await connectDatabase();const user=await User.findOne({email,isActive:true}).select('+passwordHash');
 if(!user||(!user.passwordHash&&!user.googleSubject))throw new Error('Sign up or complete Google sign-in first. This command does not create passwords.');
 user.role='super_admin';await user.save();console.log('Promoted selected account to super administrator. Remove BOOTSTRAP_ADMIN_EMAIL after use.');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(disconnectDatabase);
