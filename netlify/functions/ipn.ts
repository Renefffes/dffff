import { Handler } from '@netlify/functions';

export const handler: Handler = async (event, context) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: 'Method Not Allowed',
    };
  }

  try {
    // Parse the incoming JSON payload from Paymento
    const body = JSON.parse(event.body || '{}');
    console.log("Received IPN from Paymento:", body);
    
    const { amount, status, transaction_id, custom_data } = body;
    
    // Check if the payment was successful
    if (status === "completed" || status === "paid") {
      console.log(`Payment confirmed! Added ${amount} to user ${custom_data}`);
      // TODO: Update user balance in your database here
    }

    // Always return 200 OK to acknowledge receipt
    return {
      statusCode: 200,
      body: "OK",
    };
  } catch (error) {
    console.error("Error processing IPN:", error);
    return {
      statusCode: 400,
      body: "Bad Request",
    };
  }
};
