import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

import IGAdapter from './ig-adapter.js';

(async () => {
  console.log('🧪 Testing IG auth with your credentials...');
  const ig = new IGAdapter();
  try {
    const success = await ig.connect();
    console.log('✅ IG Connected successfully!');
    console.log('Session token:', ig.sessionToken ? 'set' : 'missing');
    console.log('CST token:', ig.cstToken ? 'set' : 'missing');
    process.exit(0);
  } catch (err) {
    console.error('❌ IG Auth failed:');
    console.error(err.message);
    if (err.response) {
      console.error('Status:', err.response.status);
      console.error('Data:', err.response.data);
    }
    process.exit(1);
  }
})();