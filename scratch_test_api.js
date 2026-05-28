import mongoose from 'mongoose';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import User from './models/User.js';

dotenv.config();

async function main() {
    await mongoose.connect(process.env.MONGO_URI);
    
    const user = await User.findOne({ email: 'lundrim.maxhuni@umib.net' });
    if (!user) {
        console.error('User not found');
        await mongoose.disconnect();
        return;
    }
    
    // Sign a token for the user
    const token = jwt.sign({ id: user._id, email: user.email, name: user.name }, process.env.JWT_SECRET, {
        expiresIn: '30d'
    });
    
    console.log('Signed Token:', token);
    
    // Start temporary server checks if server is not running (it should be stopped since we killed it, let's just query the DB function serializeUserSettings directly!)
    console.log('User levels/xp in DB:', {
        xp: user.xp,
        level: user.level,
        streakFreezes: user.streakFreezes,
        badges: user.badges
    });
    
    const serializeUserSettings = (u) => ({
      profile: {
        name: u.name,
        email: u.email,
        timezone: u.timezone || "UTC"
      },
      settings: u.settings || {},
      xp: u.xp || 0,
      level: u.level || 1,
      streakFreezes: u.streakFreezes || 0,
      frozenDates: u.frozenDates || [],
      badges: u.badges || []
    });
    
    console.log('Serialized:', serializeUserSettings(user));
    
    await mongoose.disconnect();
}

main().catch(err => {
    console.error(err);
    mongoose.disconnect();
});
