import 'dotenv/config';
import mongoose from 'mongoose';
import User from './src/models/User.model.js';
import connectDB from './src/config/db.js';

await connectDB();

// Clear existing users
await User.deleteMany({});

// Create three demo users — one per role
await User.create([
  {
    name: 'Admin User',
    email: 'admin@demo.com',
    password: 'Demo1234',
    role: 'admin',
    organisation: 'demo-org',
  },
  {
    name: 'Editor User',
    email: 'editor@demo.com',
    password: 'Demo1234',
    role: 'editor',
    organisation: 'demo-org',
  },
  {
    name: 'Viewer User',
    email: 'viewer@demo.com',
    password: 'Demo1234',
    role: 'viewer',
    organisation: 'demo-org',
  },
]);

console.log('✅ Seeded successfully.');
console.log('   admin@demo.com / Demo1234 (admin)');
console.log('   editor@demo.com / Demo1234 (editor)');
console.log('   viewer@demo.com / Demo1234 (viewer)');

await mongoose.disconnect();
