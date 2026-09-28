import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { phone, message, orderId } = body;

    if (!phone || !message) {
      return NextResponse.json({ error: 'Phone and message are required' }, { status: 400 });
    }

    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const formattedPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;

    // 1. Check if WhatsApp Cloud API / Gateway is configured
    const whatsappToken = process.env.WHATSAPP_API_TOKEN;
    const whatsappPhoneId = process.env.WHATSAPP_PHONE_ID;

    if (whatsappToken && whatsappPhoneId) {
      const metaRes = await fetch(
        `https://graph.facebook.com/v19.0/${whatsappPhoneId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${whatsappToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: formattedPhone,
            type: 'text',
            text: { preview_url: false, body: message },
          }),
        }
      );

      const metaData = await metaRes.json();
      if (!metaRes.ok) {
        console.error('Meta WhatsApp API Error:', metaData);
        return NextResponse.json(
          {
            success: false,
            error: metaData.error?.message || 'Failed to send via WhatsApp Cloud API',
            fallbackPhone: formattedPhone,
          },
          { status: 200 }
        );
      }

      return NextResponse.json({
        success: true,
        method: 'cloud_api',
        messageId: metaData.messages?.[0]?.id,
      });
    }

    // 2. If Cloud API credentials are not yet set in .env, respond with instructions and direct deep link
    return NextResponse.json({
      success: false,
      isConfigured: false,
      fallbackPhone: formattedPhone,
      message: 'Cloud API credentials not set. Use direct app protocol.',
    });
  } catch (error: any) {
    console.error('WhatsApp send error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
