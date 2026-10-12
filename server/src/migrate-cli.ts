import {migrateFromEnvironment} from './migrate.js';

try{await migrateFromEnvironment();}
catch(error){
 console.error('Database migration failed:',error instanceof Error?error.message:'Unknown error');
 process.exitCode=1;
}
