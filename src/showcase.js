// This module is imported only in the explicit showcase build, never in production.
let role = 'guest';
const settings = {heroTitle:'与当地人一起，走进韩国',heroSubtitle:'按你的时间和目的，寻找合适的韩国地陪。',support:'平台客服',rules:'地陪确认后付款。此页面是界面预览，不接受真实预约。',faq:'所有时间均为韩国时间。预览人物为虚构示例。',commissionRate:0.15,responseHours:12,paymentMinutes:30,bufferMinutes:30,settlementHours:24,paymentInstructions:''};
const guides = [
 {id:'sample-1',name:'金敏智 · 示例',city:'seoul',purposes:['tourism','concert'],bio:'一起逛首尔的街巷、咖啡馆与展览，也可以陪你规划演唱会当天的交通。此资料仅用于展示页面。',rate:35000,style:'friendly'},
 {id:'sample-2',name:'朴俊宇 · 示例',city:'seoul',purposes:['tourism','business','medical'],bio:'商务会面、城市探索与就诊陪同沟通。此为虚构示例，不代表实际服务资质。',rate:45000,style:'professional'},
 {id:'sample-3',name:'李书妍 · 示例',city:'busan',purposes:['tourism','concert'],bio:'从海边散步到本地美食，体验釜山的一天。此资料仅用于展示页面。',rate:30000,style:'quiet'}
].map(g=>({...g,isDemo:true,status:'approved',paused:false,capacity:6,languages:'中文 · 한국어',chineseLevel:'fluent',image:'',reviewCount:0,rating:0,reviews:[],reviewNote:'演示资料，所有修改操作已关闭。'}));
export async function showcaseApi(path, method, body) {
 if(path==='/showcase/role'){role=body.role;return {};}
 if(method!=='GET')throw Error('这是只读界面预览，请使用顶部按钮切换三端；不创建真实账户、订单或付款。');
 if(path==='/session')return {user:{id:'preview-'+role,name:'预览'+({guest:'游客',guide:'地陪',admin:'管理员'}[role]),role},settings,manualPayments:false};
 if(path.startsWith('/guides?')) {const q=new URLSearchParams(path.split('?')[1]);return guides.filter(g=>g.city===q.get('city')&&(q.get('purposes')||'').split(',').every(p=>g.purposes.includes(p))&&Number(q.get('adults'))+Number(q.get('children'))<=g.capacity&&(!q.get('budget')||g.rate*Number(q.get('hours'))<=Number(q.get('budget')))&&(!q.get('chinese')||q.get('chinese')===g.chineseLevel)&&(!q.get('style')||q.get('style')===g.style)).map(g=>({...g,total:g.rate*Number(q.get('hours'))}));}
 if(path.startsWith('/guides/'))return guides.find(g=>g.id===path.split('/')[2]);
 if(path==='/guide/profile')return guides[0];
 if(path==='/guide/availability')return [1,2,3,4,5].map(n=>({id:'slot-'+n,weekday:n,start:540,end:1080,blocked:false}));
 if(path==='/admin/guides')return guides;
 if(path==='/admin/stats')return {approved:3,guides:3,searches:0,bookings:0,paid:0,completed:0,revenue:0,refunded:0,purposes:['tourism','business','medical','concert'].map(p=>({purpose:p,searches:0,bookings:0})),cities:[{city:'seoul',count:2},{city:'busan',count:1}]};
 if(['/bookings','/notifications','/admin/cases','/admin/reviews','/admin/users','/admin/audit'].includes(path))return [];
 throw Error('此功能需要连接正式后端；当前为只读界面预览。');
}
