import test from 'node:test';
import assert from 'node:assert/strict';
import { detectIntent } from '../src/agent/intentEngine.js';

const requests = [
  ["GET_SMOG_PLAN", "Create a smog plan", "स्मॉग प्लान बनाओ", "mera smgo plan banao"],
  ["GET_AIR_QUALITY", "current AQI", "आज हवा की गुणवत्ता कैसी है", "aaj hawa kaisi hai"],
  ["GET_WEATHER", "weather today", "आज मौसम कैसा है", "aaj mausam kaisa hai"],
  ["GET_WATER_QUALITY", "drinking water quality", "पानी की गुणवत्ता", "paani ki quality"],
  ["CREATE_REPORT", "I saw burning garbage near our street", "मैंने सड़क पर कचरा जलते देखा", "maine sadak par kachra jalte dekha"],
  ["UPLOAD_PHOTO_REPORT", "analyze image", "इस फोटो की जाँच करो", "is tasveer ko check karo"],
  ["FIND_EVENTS", "find eco meetups", "सफाई अभियान ढूँढो", "safai abhiyan dhundo"],
  ["JOIN_EVENT", "join meetup", "कार्यक्रम में पंजीकरण करो", "meetup mein register karo"],
  ["CREATE_EVENT", "organize a community cleanup", "सफाई अभियान आयोजित करो", "safai abhiyan aayojit karo"],
  ["CREATE_EMAIL", "draft an email about garbage dumping", "कचरे की शिकायत का ईमेल लिखो", "kachre ki shikayat ka email likho"],
  ["GET_AUTHORITY_CONTACTS", "local authority contacts", "नगर निगम का हेल्पलाइन नंबर", "nagar nigam ka helpline number"],
  ["GET_COMMUNITY", "community feed", "समुदाय की पोस्ट दिखाओ", "samuday ki posts dikhao"],
  ["GET_DAILY_PLAN", "eco daily plan", "आज की पर्यावरण दिनचर्या", "aaj ki paryavaran dincharya"],
  ["GET_HEALTH_TIPS", "AQI health tips", "प्रदूषण में स्वास्थ्य सुझाव", "pradushan mein sehat ke tips"],
  ["GET_ROUTES", "low-pollution route", "कम प्रदूषण वाला रास्ता", "kam pradushan wala rasta"],
  ["GET_USER_IMPACT", "my eco impact", "मेरी पर्यावरण गतिविधि", "meri eco activity"],
  ["GET_WASTE_TIPS", "waste reduction", "कचरा अलग कैसे करें", "kachra alag kaise kare"],
  ["ASK_QUESTION", "How do I repair a chair?", "मुझे एक कविता सुनाओ", "ek kavita sunao"],
];

for (const [intent, ...questions] of requests) {
  test(intent + ' accepts English, Hindi and Hinglish requests', () => {
    for (const question of questions) assert.equal(detectIntent(question).intent, intent, question);
  });
}
