import {parse} from 'csv-parse/sync';
import {readSheet} from 'read-excel-file/node';
import {unzipSync} from 'fflate';
import {z} from 'zod';
import {AppError} from '../db.js';
export type Contact={row:number;name:string;email:string;phone:string;reference_id:string;status:string};
const aliases:Record<string,string>={name:'name',fullname:'name',email:'email',emailaddress:'email',phonenumber:'phone',phone:'phone',participantid:'reference_id',referenceid:'reference_id',reference:'reference_id'};
export async function parseContacts(buffer:Buffer,filename:string):Promise<Contact[]>{
 if(buffer.length>2*1024*1024)throw new AppError(413,'Spreadsheet must be smaller than 2 MB');
 let rows:unknown[][];
 try{
  if(/\.csv$/i.test(filename)){rows=parse(buffer,{bom:true,skip_empty_lines:true,max_record_size:4096,to:1002}) as unknown[][];}
  else if(/\.xlsx$/i.test(filename)){
   let size=0,entries=0;unzipSync(buffer,{filter:file=>{size+=file.originalSize;entries++;if(size>20*1024*1024||entries>2000||file.originalSize>8*1024*1024)throw new Error('Expanded workbook too large');return false;}});
   rows=await readSheet(buffer,1) as unknown[][];
  }else throw new AppError(400,'Use a CSV or XLSX spreadsheet');
 }catch(error){if(error instanceof AppError)throw error;throw new AppError(400,'Cannot read this spreadsheet. Use a valid CSV or XLSX file under the size limits.');}
 if(rows.length<2)throw new AppError(400,'Add a header row and at least one contact');
 if(rows.length>1001)throw new AppError(413,'Import up to 1,000 contacts at a time');
 if(rows.some(row=>row.length>50))throw new AppError(400,'Use no more than 50 columns');
 const headers=rows[0].map(value=>aliases[String(value??'').toLowerCase().replace(/[^a-z]/g,'')]);
 if(!headers.includes('email'))throw new AppError(400,'An Email or Email Address column is required');
 for(const field of ['name','email','phone','reference_id'])if(headers.filter(header=>header===field).length>1)throw new AppError(400,`Duplicate ${field} column`);
 const seen=new Set<string>();
 return rows.slice(1).filter(row=>row.some(value=>String(value??'').trim())).map((row,index)=>{
  const cell=(key:string)=>{const value=row[headers.indexOf(key)];return typeof value==='string'||typeof value==='number'?String(value).trim():'';};
  const contact={row:index+2,name:cell('name'),email:cell('email').toLowerCase(),phone:cell('phone'),reference_id:cell('reference_id'),status:'ready'};
  if(!z.email().safeParse(contact.email).success||contact.email.length>254)contact.status='invalid_email';
  else if(contact.name.length>200||contact.phone.length>40||contact.reference_id.length>100)contact.status='invalid_fields';
  else if(seen.has(contact.email))contact.status='duplicate_in_file';
  seen.add(contact.email);return contact;
 });
}
export function maskEmail(email:string){const at=email.lastIndexOf('@');return at<1?'***':email.slice(0,Math.min(2,at))+'***'+email.slice(at);}
