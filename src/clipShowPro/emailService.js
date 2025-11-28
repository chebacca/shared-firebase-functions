"use strict";
/**
 * Email Service Utility
 * Handles email notifications for Clip Show Pro
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.emailService = void 0;
const nodemailer = __importStar(require("nodemailer"));
class EmailService {
    constructor() {
        // Configure email service (using Gmail SMTP as default)
        const config = {
            host: 'smtp.gmail.com',
            port: 587,
            secure: false,
            auth: {
                user: process.env.EMAIL_USER || 'your-email@gmail.com',
                pass: process.env.EMAIL_PASS || 'your-app-password'
            }
        };
        this.transporter = nodemailer.createTransport(config);
    }
    async sendEmail(emailData) {
        try {
            const mailOptions = {
                from: process.env.EMAIL_FROM || 'Clip Show Pro <noreply@clipshowpro.com>',
                to: Array.isArray(emailData.to) ? emailData.to.join(', ') : emailData.to,
                subject: emailData.subject,
                html: emailData.html,
                text: emailData.text || emailData.html.replace(/<[^>]*>/g, '')
            };
            await this.transporter.sendMail(mailOptions);
            console.log('Email sent successfully');
        }
        catch (error) {
            console.error('Error sending email:', error);
            throw error;
        }
    }
    // Email templates for Clip Show Pro
    generatePitchStatusChangeEmail(pitch, user, newStatus, reason) {
        const statusColors = {
            'Pitched': '#2196F3',
            'Pursue Clearance': '#FF9800',
            'Ready to License': '#4CAF50',
            'Cleared': '#4CAF50',
            'Rejected': '#F44336'
        };
        return {
            to: user.email,
            subject: `Pitch Status Update: ${pitch.clipTitle}`,
            html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">🎬 Clip Show Pro</h1>
          </div>
          
          <div style="padding: 20px; background: #f9f9f9;">
            <h2 style="color: #333; margin-top: 0;">Pitch Status Update</h2>
            
            <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #333; margin-top: 0;">${pitch.clipTitle}</h3>
              <p><strong>Show:</strong> ${pitch.show}</p>
              <p><strong>Season:</strong> ${pitch.season}</p>
              <p><strong>Clip Type:</strong> ${pitch.clipType}</p>
              
              <div style="margin: 20px 0;">
                <span style="background: ${statusColors[newStatus] || '#666'}; color: white; padding: 8px 16px; border-radius: 20px; font-weight: bold;">
                  Status: ${newStatus}
                </span>
              </div>
              
              ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
            </div>
            
            <div style="text-align: center; margin: 20px 0;">
              <a href="https://backbone-logic.web.app/pitches" 
                 style="background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                View in Clip Show Pro
              </a>
            </div>
          </div>
          
          <div style="background: #333; color: white; padding: 20px; text-align: center; font-size: 12px;">
            <p>This email was sent from Clip Show Pro. If you have any questions, please contact your administrator.</p>
          </div>
        </div>
      `
        };
    }
    generatePitchAssignmentEmail(pitch, user, assignedTo) {
        return {
            to: user.email,
            subject: `Pitch Assignment: ${pitch.clipTitle}`,
            html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">🎬 Clip Show Pro</h1>
          </div>
          
          <div style="padding: 20px; background: #f9f9f9;">
            <h2 style="color: #333; margin-top: 0;">Pitch Assignment</h2>
            
            <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #333; margin-top: 0;">${pitch.clipTitle}</h3>
              <p><strong>Show:</strong> ${pitch.show}</p>
              <p><strong>Season:</strong> ${pitch.season}</p>
              <p><strong>Assigned to:</strong> ${assignedTo}</p>
            </div>
            
            <div style="text-align: center; margin: 20px 0;">
              <a href="https://backbone-logic.web.app/pitches" 
                 style="background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                View in Clip Show Pro
              </a>
            </div>
          </div>
          
          <div style="background: #333; color: white; padding: 20px; text-align: center; font-size: 12px;">
            <p>This email was sent from Clip Show Pro. If you have any questions, please contact your administrator.</p>
          </div>
        </div>
      `
        };
    }
    generateLicensingSpecialistEmail(pitch, user, specialist) {
        return {
            to: user.email,
            subject: `Licensing Specialist Assignment: ${pitch.clipTitle}`,
            html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">🎬 Clip Show Pro</h1>
          </div>
          
          <div style="padding: 20px; background: #f9f9f9;">
            <h2 style="color: #333; margin-top: 0;">Licensing Specialist Assignment</h2>
            
            <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #333; margin-top: 0;">${pitch.clipTitle}</h3>
              <p><strong>Show:</strong> ${pitch.show}</p>
              <p><strong>Season:</strong> ${pitch.season}</p>
              <p><strong>Licensing Specialist:</strong> ${specialist}</p>
              <p><strong>Status:</strong> Ready to License</p>
            </div>
            
            <div style="text-align: center; margin: 20px 0;">
              <a href="https://backbone-logic.web.app/pitches" 
                 style="background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                View in Clip Show Pro
              </a>
            </div>
          </div>
          
          <div style="background: #333; color: white; padding: 20px; text-align: center; font-size: 12px;">
            <p>This email was sent from Clip Show Pro. If you have any questions, please contact your administrator.</p>
          </div>
        </div>
      `
        };
    }
}
exports.emailService = new EmailService();
