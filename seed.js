import 'dotenv/config';
import mongoose from 'mongoose';
import User from './src/models/User.model.js';
import connectDB from './src/config/db.js';

await connectDB();

// Clear existing users
await User.deleteMany({});

await User.create([
  // ── SuperAdmin — not tied to any organisation ──────────────────────────
  {
    name: 'Super Admin',
    email: 'superadmin@galary.com',
    password: 'SuperAdmin@123',
    role: 'superadmin',
    organisation: '',
  },

  // ── Demo Org ───────────────────────────────────────────────────────────
  {
    name: 'Demo Admin',
    email: 'admin@demo.com',
    password: 'Demo1234',
    role: 'admin',
    organisation: 'demo-org',
  },
  {
    name: 'Demo Editor',
    email: 'editor@demo.com',
    password: 'Demo1234',
    role: 'editor',
    organisation: 'demo-org',
  },
  {
    name: 'Demo Viewer',
    email: 'viewer@demo.com',
    password: 'Demo1234',
    role: 'viewer',
    organisation: 'demo-org',
  },
]);

console.log('✅ Seeded successfully.');
console.log('');
console.log('   superadmin@galary.com / SuperAdmin@123  (superadmin — no org)');
console.log('   admin@demo.com        / Demo1234        (admin — demo-org)');
console.log('   editor@demo.com       / Demo1234        (editor — demo-org)');
console.log('   viewer@demo.com       / Demo1234        (viewer — demo-org)');

await mongoose.disconnect();
