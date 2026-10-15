import {z} from 'zod';
import {intentSchema} from '@beta/shared';

export const commandNames=['RECORD_SALE','RECORD_EXPENSE','GET_TODAY_SALES','GET_PERIOD_SALES','CHECK_STOCK','ADD_STOCK','RECORD_DEBT','CHECK_DEBT','RECORD_DEBT_PAYMENT','LIST_DEBTORS','GET_EXPENSES','GET_PROFIT_SUMMARY','CONFIRM','CANCEL','HELP'] as const;
type Name=typeof commandNames[number];
type Product={name:string;selling_price?:string;id?:string};
export type Command={intent:Name;confidence:number;entities:{product?:string;quantity?:number;unit_price?:string;amount?:string;customer?:string;period?:string;category?:string};missing:string[];clarification?:string};
export const normalize=(text:string)=>text.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[₦,]/g,'').replace(/[^\p{L}\p{N}.\s]/gu,' ').replace(/\.(?!\d)/g,' ').replace(/\s+/g,' ').trim();
const small:Record<string,number>={zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90,okan:1,meji:2,meta:3,merin:4,marun:5,daya:1,biyu:2,uku:3,hudu:4,biyar:5,otu:1,abuo:2,ato:3,ano:4,ise:5};
export function parseNumber(text:string):string|undefined{
 if(/[-?]\s*\d/.test(text))return undefined;
 const s=normalize(text).replace(/\b(naira|each|per|bag|bottle|and|is|it|was|the|price)\b/g,' ').trim();
 if(/^\d+(?:\.\d{1,2})?$/.test(s))return s;
 let total=0,current=0,seen=false;
 for(const word of s.split(/\s+/)){if(word in small){current+=small[word];seen=true;}else if(word==='hundred'){current=(current||1)*100;}else if(word==='thousand'||word==='million'){total+=(current||1)*(word==='thousand'?1000:1000000);current=0;}else return undefined;}
 return seen&&total+current<=9999999999?String(total+current):undefined;
}
function distance(a:string,b:string){const row=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){let prev=row[0];row[0]=i;for(let j=1;j<=b.length;j++){const old=row[j];row[j]=Math.min(row[j]+1,row[j-1]+1,prev+(a[i-1]===b[j-1]?0:1));prev=old;}}return row[b.length];}
export function parseCommand(text:string,products:Product[],previous?:Command):Command{
 if(/[-−]\s*\d/.test(text))return {intent:'HELP',confidence:0,entities:{},missing:[],clarification:'help'};
 const s=normalize(z.string().trim().min(1).max(16000).parse(text));
 const rules:[Name,RegExp][]=[['CANCEL',/^(cancel|stop|never mind|fagile|soke|kagbu)$/],['CONFIRM',/^(yes|confirm|correct|beni|bee ni|eh|ee|iya)$/],['HELP',/^(help|help me|iranlowo|taimako|enyemaka)$/],['RECORD_DEBT_PAYMENT',/\b(repaid|repayment|paid back|san gbese|biya bashi|kwuo ugwo)\b/],['LIST_DEBTORS',/\b(who owes|list debtors|awon onigbese|masu bashi)\b/],['CHECK_DEBT',/\b(owes|debt balance|check debt|gbese|bashi|ugwo)\b/],['GET_PROFIT_SUMMARY',/\b(profit|ere oni|riba|uru)\b/],['GET_TODAY_SALES',/\b(how much.*today|today.*sales|sales today|tita oni|cinikin yau|ahia taa)\b/],['GET_PERIOD_SALES',/\b(sales.*(week|month|yesterday)|sold.*(week|month)|how much.*(week|month|yesterday)|tita ose|cinikin wata)\b/],['GET_EXPENSES',/\b(show expenses|how much.*spent|expenses today|owo inawo)\b/],['ADD_STOCK',/\b(restock|add stock|received|fi.*kun|kara kaya|tinye ngwaahia)\b/],['CHECK_STOCK',/\b(stock|how many.*left|in stock|o ku|kaya.*rage|fodu)\b/],['RECORD_DEBT',/\b(lend|lent|record debt|on credit|ya.*owo)\b/],['RECORD_EXPENSE',/\b(spent|expense|paid for|bought|na owo|naira.*transport|kashe|mefuru)\b/],['RECORD_SALE',/\b(sold|sell|sale|ta|mo ta|sayar|ere|na ere)\b/]];
 const matched=rules.find(([,rule])=>rule.test(s));
 let intent=matched?.[0];const continuing=!intent&&previous&&previous.missing.length>0;
 if(continuing)intent=previous.intent;
 const result:Command={intent:intent??'HELP',confidence:intent?0.8:0,entities:continuing?{...previous.entities}:{},missing:[]};
 if(!intent){result.clarification='help';return result;}
 if(['CONFIRM','CANCEL','HELP'].includes(intent))return result;
 const exact=products.filter(p=>new RegExp(`(?:^| )${normalize(p.name).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?: |$)`,'u').test(s));
 let match=exact.length===1?exact[0]:undefined;
 if(!match&&!exact.length){const candidates=products.filter(p=>s.split(' ').some(w=>w.length>=4&&normalize(p.name).length>=4&&1-distance(w,normalize(p.name))/Math.max(w.length,normalize(p.name).length)>=0.85));if(candidates.length===1)match=candidates[0];}
 if(match)result.entities.product=match.name;
 if(exact.length>1){delete result.entities.product;result.confidence=0.3;}
 const amountMatch=s.match(/\b(?:at|each|per|for|amount|spent|paid|lent|repaid)\s+(.+?)(?:\s+(?:each|per|naira|to|from|on)\b|$)/);
 const amount=amountMatch?parseNumber(amountMatch[1]):undefined;
 if(amount&&(intent!=='RECORD_SALE'||/\b(at|each|per)\b/.test(s)))result.entities[intent==='RECORD_SALE'?'unit_price':'amount']=amount;
 const quantityText=match?s.slice(0,s.indexOf(normalize(match.name))):'';
 const qty=quantityText.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|meji|meta|daya|biyu|uku|otu|abuo|ato)(?:\s|$)/u);
 if(qty){const value=Number(parseNumber(qty[1]));if(Number.isInteger(value)&&value>0&&value<=100000)result.entities.quantity=value;}
 const customer=s.match(/\b(?:to|from|customer)\s+([\p{L}][\p{L}\s]{0,99})$/u);if(customer)result.entities.customer=customer[1].trim();
 result.entities.period=/\b(last month|osu to koja|watan da ya gabata|onwa gara aga)\b/.test(s)?'last_month':/\b(last week|ose to koja|makon da ya gabata|izu gara aga)\b/.test(s)?'last_week':/\b(month|osu|wata|onwa)\b/.test(s)?'month':/\b(week|ose|mako|izu)\b/.test(s)?'week':/\b(yesterday|ana|jiya|nyaahu)\b/.test(s)?'yesterday':result.entities.period??'today';
 const category=s.match(/\b(transport|rent|utilities|supplies|food)\b/);if(category)result.entities.category=category[1];
 if(continuing){const value=parseNumber(s);const field=previous.missing[0];if(value&&['unit_price','amount'].includes(field))result.entities[field as 'unit_price'|'amount']=value;if(value&&field==='quantity'&&Number.isInteger(Number(value))&&Number(value)>0)result.entities.quantity=Number(value);if(field==='customer'&&!value)result.entities.customer=text.trim().slice(0,100);}
 const required:Partial<Record<Name,string[]>>={RECORD_SALE:['product','quantity','unit_price'],RECORD_EXPENSE:['amount','category'],ADD_STOCK:['product','quantity'],RECORD_DEBT:['customer','amount'],RECORD_DEBT_PAYMENT:['customer','amount'],CHECK_STOCK:['product']};
 result.missing=(required[intent]??[]).filter(field=>!(result.entities as Record<string,unknown>)[field]);
 if(exact.length>1)result.missing=['product',...result.missing.filter(x=>x!=='product')];
 result.confidence=result.missing.length?0.55:0.9;
 if(result.missing.length)result.clarification=result.missing[0];
 return result;
}

// Bounded, short-lived, user/business-scoped drafts. Restarting the process discards drafts.
const drafts=new Map<string,{command:Command;expires:number}>();
export function commandTurn(scope:string,text:string,products:Product[]){const old=drafts.get(scope);const command=parseCommand(text,products,old&&old.expires>Date.now()?old.command:undefined);if(command.intent==='CANCEL')drafts.delete(scope);else if(!['HELP','CONFIRM'].includes(command.intent)){if(drafts.size>=2000)drafts.delete(drafts.keys().next().value!);drafts.set(scope,{command,expires:Date.now()+5*60_000});}return command;}
export function saleIntent(text:string,products:Product[],scope:string){const command=commandTurn(scope,text,products);if(command.intent!=='RECORD_SALE')return intentSchema.parse({intent:'record_sale',items:[{product_name:command.entities.product??'Unrecognized product',quantity:null,unit_price:null}],payment_status:'unknown',clarification:'Please describe the sale, or cancel and try again.'});return intentSchema.parse({intent:'record_sale',items:[{product_name:command.entities.product??'Unrecognized product',quantity:command.entities.quantity??null,unit_price:command.entities.unit_price??null}],payment_status:'unknown',...(command.missing.length?{clarification:`Please confirm ${command.missing.join(', ').replaceAll('_',' ')}.`}:{})});}
