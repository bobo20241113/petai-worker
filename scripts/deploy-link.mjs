// Usage: npm run deploy:link -- https://github.com/OWNER/REPO [main] [petai-worker]
const [repo,branch='main',directory=''] = process.argv.slice(2);
if(!/^https:\/\/github\.com\/[^/]+\/[^/]+\/?$/.test(repo||'')){
 console.error('用法: npm run deploy:link -- https://github.com/OWNER/REPO [main] [子目录]');process.exit(1);
}
const url=repo.replace(/\/$/,'')+(directory?'/tree/'+encodeURIComponent(branch)+'/'+directory.split('/').map(encodeURIComponent).join('/'):'');
const link='https://deploy.workers.cloudflare.com/?url='+encodeURIComponent(url);
console.log('[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)]('+link+')');
