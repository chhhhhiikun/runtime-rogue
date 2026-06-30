// 山札 / 手札 / 捨て札の管理。アンロック型＋全捨て方式。

import type { CardId } from "./cards";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class Deck {
  drawPile: CardId[];
  hand: CardId[] = [];
  discardPile: CardId[] = [];
  disposedCards: CardId[] = [];

  constructor(starter: CardId[]) {
    this.drawPile = shuffle(starter);
  }

  // n 枚ドロー。山札が尽きたら捨て札をシャッフルして補充。
  draw(n: number): void {
    for (let i = 0; i < n; i++) {
      if (this.drawPile.length === 0) {
        if (this.discardPile.length === 0) break; // カード切れ
        this.drawPile = shuffle(this.discardPile);
        this.discardPile = [];
      }
      const card = this.drawPile.pop();
      if (card) this.hand.push(card);
    }
  }

  // 手札を全て捨て札へ（使用・未使用の区別なし）。
  discardHand(): void {
    this.discardPile.push(...this.hand);
    this.hand = [];
  }

  // 指定カードを手札から捨て札へ移し、n枚ドローする。
  cycleCards(toDiscard: CardId[], drawCount: number): void {
    for (const id of toDiscard) {
      const idx = this.hand.indexOf(id);
      if (idx !== -1) {
        this.hand.splice(idx, 1);
        this.discardPile.push(id);
      }
    }
    this.draw(drawCount);
  }

  // 手札にあるユニークなカードID（= 今ターン呼べる関数）。
  availableCards(): CardId[] {
    return [...new Set(this.hand)];
  }

  // Disposable カードを手札/捨て札から除外して disposedCards へ移動
  disposeCard(id: CardId): void {
    const handIdx = this.hand.indexOf(id);
    if (handIdx !== -1) {
      this.hand.splice(handIdx, 1);
      this.disposedCards.push(id);
      return;
    }
    const discardIdx = this.discardPile.indexOf(id);
    if (discardIdx !== -1) {
      this.discardPile.splice(discardIdx, 1);
      this.disposedCards.push(id);
    }
  }

  // disposedCards を drawPile に戻す（ステージクリア時）
  restoreDisposedCards(): void {
    this.drawPile.push(...this.disposedCards);
    this.disposedCards = [];
  }

  // ターン中ドロー（引いたカードのリストを返す）
  drawMidTurn(n: number): CardId[] {
    const drawn: CardId[] = [];
    for (let i = 0; i < n; i++) {
      if (this.drawPile.length === 0) {
        if (this.discardPile.length === 0) break;
        this.drawPile = shuffle(this.discardPile);
        this.discardPile = [];
      }
      const card = this.drawPile.pop();
      if (card) {
        this.hand.push(card);
        drawn.push(card);
      }
    }
    return drawn;
  }

  // 手札から1枚を捨て札へ
  discardOne(id: CardId): void {
    const idx = this.hand.indexOf(id);
    if (idx !== -1) {
      this.hand.splice(idx, 1);
      this.discardPile.push(id);
    }
  }

  // 現在の手札を返す
  peekHand(): CardId[] {
    return [...this.hand];
  }
}
