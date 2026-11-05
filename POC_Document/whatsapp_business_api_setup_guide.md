# WhatsApp Business API Setup Guide

Setting up the WhatsApp Business Cloud API directly through Meta allows you to build custom integrations without relying on third-party providers. Here is the step-by-step process to create your account and send your first message.

## 1. Create a Meta App
Go to the [Meta for Developers](https://developers.facebook.com/) dashboard and log in. Click **Create App**, select the **Connect with customers through WhatsApp** use case, and enter your app name and business email.

## 2. Connect a Meta Business Portfolio
During the app creation, you will be asked to select an existing Meta Business Portfolio or create a new one. Ensure your portfolio details (trade name, tax address, website) exactly match your official company documents to avoid issues during business verification.

## 3. Access the API Setup
Once your app is created, you will be redirected to your App Dashboard. Navigate to **WhatsApp > API Setup** in the left menu and click **Start using the API**. This action connects your app to a WhatsApp Business account and generates a temporary access token for testing.

## 4. Register Your Phone Number
Meta provides a test phone number by default so you can start developing immediately. To add your actual business number for production use:
1. Scroll down the API page and click **Add phone number**. 
2. Follow the OTP verification steps.

*Note: The phone number you register here **cannot** be actively registered on the standard consumer WhatsApp or the WhatsApp Business mobile app. You must delete the account off the mobile app before linking it to the API.*

## 5. Send a Test Message
In the API Setup panel, use the temporary access token provided. Add your personal mobile number as the recipient in the "To" field, follow the prompts to verify your personal number as a test recipient, and click **Send message**. This confirms your infrastructure is working.

## 6. Verify Your Business (Production)
To go live and message more than 250 unique customers per 24 hours, you must complete **Business Verification** in the Meta Business Suite. 
* **Required Documents:** You will need to submit official documentation such as your company's tax ID, commercial registration certificate, or a utility bill. 
* **Benefits:** Verification unlocks higher messaging tiers (starting at 1,000+ daily messages) and allows you to apply for an Official Business Account (the green checkmark badge).