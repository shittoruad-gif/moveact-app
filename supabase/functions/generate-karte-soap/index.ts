// Supabase Edge Function: generate-karte-soap
// =====================================================
// スタッフが入力した「その時の症状・施術内容」と選択した項目（経穴・エクササイズ・悩み）から、
// Google Gemini API (gemini-2.0-flash) を使って SOAP 形式のカルテ下書きを自動生成する。
// 無料枠で動作する。
//
// 【入力】
//   { rawText, treatmentType, selectedItems: string[] }
// 【出力】
//   { subjective, objective, assessment, treatmentContent, treatmentPlan, homeCareAdvice }
//   ※生成結果はあくまで「下書き」。クライアント側で編集可能。
//
// 必要な環境変数: GEMINI_API_KEY
// スタッフ/管理者のみ利用可。
// =====================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { verifyAuth, json, corsHeaders, safeErrorMessage, AuthError } from '../_shared/auth.ts';

interface RequestBody {
  rawText?: string;
  treatmentType?: string;
  selectedItems?: string[];
}

const TREATMENT_LABELS: Record<string, string> = {
  seitai: '整体',
  biyou_hari: '美容鍼',
  pilates: 'ピラティス',
  group_pilates: 'グループピラティス',
  reflexology: '足つぼ',
};

const SOAP_SCHEMA_DESC = `
出力は必ず次のキーを持つJSONオブジェクトのみ（前後に説明文やマークダウンを付けない）:
{
  "subjective": "S: 患者本人の訴え・お悩み（主観的情報）",
  "objective": "O: 施術者が観察した体の状態・検査所見（客観的情報）",
  "assessment": "A: 原因の見立て・評価",
  "treatmentContent": "P(施術): 本日実施した施術内容",
  "treatmentPlan": "P(方針): 今後の施術プラン・通院頻度の提案",
  "homeCareAdvice": "P(ホームケア): 自宅でのアドバイス"
}
各値は日本語の自然な文章。情報が無い項目は空文字 "" にする。推測しすぎず、入力内容に忠実に。専門家が読む臨床記録として簡潔に書く。`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const { userId, serviceClient } = await verifyAuth(req);

    // スタッフ/管理者のみ
    const { data: profile } = await serviceClient
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();
    if (!profile || !['staff', 'admin'].includes(profile.role)) {
      return json({ error: 'スタッフのみ利用できます' }, 403);
    }

    const body = (await req.json()) as RequestBody;
    const rawText = (body.rawText ?? '').trim();
    const selectedItems = (body.selectedItems ?? []).filter(Boolean);
    if (!rawText && selectedItems.length === 0) {
      return json({ error: '症状や施術内容を入力してください' }, 400);
    }

    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
      return json({ error: 'AI機能が未設定です（GEMINI_API_KEY）' }, 503);
    }

    const treatmentLabel = TREATMENT_LABELS[body.treatmentType ?? ''] ?? '施術';

    const userContent = [
      `施術種類: ${treatmentLabel}`,
      selectedItems.length > 0 ? `選択された項目（経穴/エクササイズ/お悩み等）: ${selectedItems.join('、')}` : '',
      `スタッフが入力したメモ:\n${rawText || '（メモなし。選択項目から推測してください）'}`,
    ].filter(Boolean).join('\n\n');

    const systemPrompt = `あなたは治療院（整体・鍼灸・ピラティス）の臨床記録を整える専門アシスタントです。スタッフのメモと選択項目から、SOAP形式のカルテ下書きを作成します。\n${SOAP_SCHEMA_DESC}`;

    // Gemini は system 指示を含めて1つの prompt にまとめる
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: userContent }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 1500,
            responseMimeType: 'application/json',
          },
        }),
      },
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('Gemini API error:', geminiRes.status, errText.slice(0, 200));
      return json({ error: 'AI生成に失敗しました。時間をおいて再度お試しください。' }, 502);
    }

    const aiData = await geminiRes.json();
    const text: string = aiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    // JSON mode なので基本そのままパースできるが、念のため { } 範囲を抽出
    let soap: Record<string, string> = {};
    try {
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start >= 0 && end > start) {
        soap = JSON.parse(text.slice(start, end + 1));
      } else {
        throw new Error('no json');
      }
    } catch {
      console.error('Failed to parse AI output:', text.slice(0, 200));
      return json({ error: 'AI出力の解析に失敗しました。もう一度お試しください。' }, 502);
    }

    return json({
      success: true,
      soap: {
        subjective: soap.subjective ?? '',
        objective: soap.objective ?? '',
        assessment: soap.assessment ?? '',
        treatmentContent: soap.treatmentContent ?? '',
        treatmentPlan: soap.treatmentPlan ?? '',
        homeCareAdvice: soap.homeCareAdvice ?? '',
      },
    });
  } catch (e) {
    if (e instanceof AuthError) return json({ error: e.message }, e.status);
    console.error('generate-karte-soap error:', safeErrorMessage(e));
    return json({ error: 'Internal error' }, 500);
  }
});
