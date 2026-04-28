export async function addPlayTime(env: any, userId: string, deltaSeconds: number): Promise<boolean> {
  try {
    const res = await env.DB.prepare(
      `UPDATE Users SET play_time_balance = play_time_balance + ? WHERE id = ?`
    ).bind(deltaSeconds, userId).run();
    return res.success;
  } catch {
    return false;
  }
}

