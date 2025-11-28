/**
 * Email template for call sheet update notifications
 */

export interface CallSheetUpdateEmailParams {
  projectName: string;
  shootDay?: string;
  updateSummary: string;
  uniqueLink: string;
  changes: {
    fields: string[];
    summary: string;
    significantChanges: {
      personnel?: { added: number; removed: number; modified: number };
      callTime?: { old: string; new: string };
      wrapTime?: { old: string; new: string };
      locations?: { added: number; removed: number; modified: number };
    };
  };
}

/**
 * Generate HTML email template for call sheet updates
 */
export function generateCallSheetUpdateEmailHTML(params: CallSheetUpdateEmailParams): string {
  const { projectName, shootDay, updateSummary, uniqueLink } = params;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Call Sheet Update</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
          background-color: #f5f5f5;
        }
        .email-container {
          background: white;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .header {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 30px;
          text-align: center;
        }
        .header h1 {
          margin: 0;
          font-size: 24px;
          font-weight: 600;
        }
        .content {
          padding: 30px;
        }
        .update-badge {
          display: inline-flex;
          align-items: center;
          background: #10b981;
          color: white;
          padding: 8px 16px;
          border-radius: 20px;
          font-size: 14px;
          font-weight: 500;
          margin-bottom: 20px;
        }
        .update-badge span {
          margin-right: 8px;
          font-size: 16px;
        }
        .message {
          background: #f8f9fa;
          padding: 20px;
          border-radius: 8px;
          border-left: 4px solid #10b981;
          margin-bottom: 20px;
        }
        .message h2 {
          margin-top: 0;
          color: #333;
          font-size: 18px;
        }
        .summary {
          background: white;
          padding: 15px;
          border-radius: 6px;
          margin: 15px 0;
          border: 1px solid #e5e7eb;
        }
        .summary-title {
          font-weight: 600;
          color: #667eea;
          margin-bottom: 10px;
        }
        .summary-text {
          color: #666;
          line-height: 1.8;
        }
        .button {
          display: inline-block;
          background: #667eea;
          color: white;
          padding: 12px 24px;
          text-decoration: none;
          border-radius: 6px;
          font-weight: 500;
          margin: 20px 0;
          text-align: center;
        }
        .button:hover {
          background: #5568d3;
        }
        .footer {
          text-align: center;
          color: #666;
          font-size: 12px;
          margin-top: 30px;
          padding-top: 20px;
          border-top: 1px solid #e5e7eb;
        }
        .footer a {
          color: #667eea;
          text-decoration: none;
        }
      </style>
    </head>
    <body>
      <div class="email-container">
        <div class="header">
          <h1>🎬 Call Sheet Update</h1>
        </div>
        <div class="content">
          <div class="update-badge">
            <span>🔄</span>
            UPDATE AVAILABLE
          </div>
          <div class="message">
            <h2>Your call sheet has been updated</h2>
            <p><strong>Project:</strong> ${projectName}${shootDay ? `<br><strong>Shoot Day:</strong> ${shootDay}` : ''}</p>
          </div>
          <div class="summary">
            <div class="summary-title">📋 Update Summary</div>
            <div class="summary-text">${updateSummary}</div>
          </div>
          <div style="text-align: center;">
            <a href="${uniqueLink}" class="button">View Updated Call Sheet</a>
          </div>
          <div class="footer">
            <p>This email was sent from Call Sheet Pro</p>
            <p>
              <a href="${uniqueLink}">View Call Sheet</a>
            </p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Generate plain text email for call sheet updates
 */
export function generateCallSheetUpdateEmailText(params: CallSheetUpdateEmailParams): string {
  const { projectName, shootDay, updateSummary, uniqueLink } = params;

  return `
Call Sheet Update

Your call sheet has been updated.

Project: ${projectName}
${shootDay ? `Shoot Day: ${shootDay}\n` : ''}

Update Summary:
${updateSummary}

View the updated call sheet: ${uniqueLink}

This email was sent from Call Sheet Pro
  `.trim();
}

