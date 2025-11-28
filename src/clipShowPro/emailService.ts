/**
 * Email Service Utility
 * Handles email notifications for Clip Show Pro
 */

import * as nodemailer from 'nodemailer';

interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

interface EmailData {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    // Configure email service (using Gmail SMTP as default)
    const config: EmailConfig = {
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

  async sendEmail(emailData: EmailData): Promise<void> {
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
    } catch (error) {
      console.error('Error sending email:', error);
      throw error;
    }
  }

  // Email templates for Clip Show Pro
  generatePitchStatusChangeEmail(pitch: any, user: any, newStatus: string, reason?: string): EmailData {
    const statusColors: Record<string, string> = {
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

  generatePitchAssignmentEmail(pitch: any, user: any, assignedTo: string): EmailData {
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

  generateLicensingSpecialistEmail(pitch: any, user: any, specialist: string): EmailData {
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

export const emailService = new EmailService();
