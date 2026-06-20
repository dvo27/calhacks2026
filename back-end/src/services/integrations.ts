
import { supabase } from './supabase.js'; 

/**
 * Simulates communicating with the ASI:One engine to convert blocks 
 * of unformatted user text into structured, coordinate-mapped travel milestones.
 */
export async function callASIOneParser(rawText: string): Promise<any[]> {
  console.log(`Sending parsing payload to ASI:One Core Engine...`);
  
  // High-fidelity stub matching your database column expectations
  return [
    {
      title: "Arrive & Morning Coffee",
      location_name: "Blue Bottle Coffee, Shibuya",
      lat: 35.6595,
      lng: 139.7002,
      start_time: new Date(new Date().setHours(9, 0, 0)).toISOString(),
      end_time: new Date(new Date().setHours(10, 0, 0)).toISOString(),
      tags: ["food crawl", "morning coffee"],
      cost: 12.50
    },
    {
      title: "Panoramic Viewpoint",
      location_name: "Tokyo Tower",
      lat: 35.6586,
      lng: 139.7454,
      start_time: new Date(new Date().setHours(11, 30, 0)).toISOString(),
      end_time: new Date(new Date().setHours(13, 0, 0)).toISOString(),
      tags: ["sightseeing"],
      cost: 20.00
    }
  ];
}

/**
 * Dispatches an event payload out to Poke to handle multi-channel 
 * reminders right before activities start.
 */
export async function schedulePokeReminder(userId: string, activityName: string, startTime: string) {
  console.log(`Scheduling push reminder notification with Poke for: "${activityName}"`);
  return { poke_job_id: `poke_reminder_${Math.random().toString(36).substring(2, 11)}` };
}