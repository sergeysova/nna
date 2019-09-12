export class UInt64 {
  /**
   * Multiply two 32-bit numbers to produce a 64-bit number.
   * @param a The first integer:  must be in [0, 2^32-1).
   * @param b The second integer: must be in [0, 2^32-1).
   */
  static mul32x32(a: number, b: number): UInt64 {
    // Directly multiplying two 32-bit numbers may produce up to 64 bits of
    // precision, thus losing precision because of the 53-bit mantissa of
    // JavaScript numbers. So we multiply with 16-bit digits (radix 65536)
    // instead.
    const aLow = a & 0xffff;
    const aHigh = a >>> 16;
    const bLow = b & 0xffff;
    const bHigh = b >>> 16;
    let productLow =
      // 32-bit result, result bits 0-31, take all 32 bits
      aLow * bLow +
      // 32-bit result, result bits 16-47, take bottom 16 as our top 16
      ((aLow * bHigh) & 0xffff) * 0x10000 +
      // 32-bit result, result bits 16-47, take bottom 16 as our top 16
      ((aHigh * bLow) & 0xffff) * 0x10000;
    let productHigh =
      // 32-bit result, result bits 32-63, take all 32 bits
      aHigh * bHigh +
      // 32-bit result, result bits 16-47, take top 16 as our bottom 16
      ((aLow * bHigh) >>> 16) +
      // 32-bit result, result bits 16-47, take top 16 as our bottom 16
      ((aHigh * bLow) >>> 16);

    // Carry. Note that we actually have up to *two* carries due to addition of
    // three terms.
    while (productLow >= 0x100000000) {
      productLow -= 0x100000000;
      productHigh += 1;
    }

    return new UInt64(productLow >>> 0, productHigh >>> 0);
  }

  /**
   * Parse a string into a 64-bit number. Returns `null` on a parse error.
   */
  static fromString(input: string): UInt64 | null {
    var result = new UInt64(0, 0);
    // optimization: reuse this instance for each digit.
    const digit64 = new UInt64(0, 0);
    for (var i = 0; i < input.length; i++) {
      if (input[i] < "0" || input[i] > "9") {
        return null;
      }
      const digit = parseInt(input[i], 10);
      digit64.lo = digit;
      result = result.mul(10).add(digit64);
    }
    return result;
  }

  constructor(public lo: number, public hi: number) {}

  cmp(other: UInt64): -1 | 0 | 1 {
    if (this.hi < other.hi || (this.hi == other.hi && this.lo < other.lo)) {
      return -1;
    } else if (this.hi == other.hi && this.lo == other.lo) {
      return 0;
    } else {
      return 1;
    }
  }

  rightShift(): UInt64 {
    const hi = this.hi >>> 1;
    const lo = (this.lo >>> 1) | ((this.hi & 1) << 31);
    return new UInt64(lo >>> 0, hi >>> 0);
  }

  leftShift(): UInt64 {
    const lo = this.lo << 1;
    const hi = (this.hi << 1) | (this.lo >>> 31);
    return new UInt64(lo >>> 0, hi >>> 0);
  }

  msb(): boolean {
    return !!(this.hi & 0x80000000);
  }

  lsb(): boolean {
    return !!(this.lo & 1);
  }

  zero(): boolean {
    return this.lo == 0 && this.hi == 0;
  }

  add(other: UInt64): UInt64 {
    const lo = ((this.lo + other.lo) & 0xffffffff) >>> 0;
    const hi =
      (((this.hi + other.hi) & 0xffffffff) >>> 0) +
      (this.lo + other.lo >= 0x100000000 ? 1 : 0);
    return new UInt64(lo >>> 0, hi >>> 0);
  }

  sub(other: UInt64): UInt64 {
    const lo = ((this.lo - other.lo) & 0xffffffff) >>> 0;
    const hi =
      (((this.hi - other.hi) & 0xffffffff) >>> 0) -
      (this.lo - other.lo < 0 ? 1 : 0);
    return new UInt64(lo >>> 0, hi >>> 0);
  }

  /**
   * Multiply this number by a 32-bit number, producing a 96-bit number, then
   * truncate the top 32 bits.
   */
  mul(a: number): UInt64 {
    // Produce two parts: at bits 0-63, and 32-95.
    const lo = UInt64.mul32x32(this.lo, a);
    const hi = UInt64.mul32x32(this.hi, a);
    // Left-shift hi by 32 bits, truncating its top bits. The parts will then be
    // aligned for addition.
    hi.hi = hi.lo;
    hi.lo = 0;
    return lo.add(hi);
  }

  /**
   * Divide a 64-bit number by a 32-bit number to produce a
   * 64-bit quotient and a 32-bit remainder.
   * @return array of [quotient, remainder],
   * unless divisor is 0, in which case an empty array is returned.
   */
  div(_divisor: number): UInt64[] {
    if (_divisor == 0) {
      return [];
    }

    // We perform long division using a radix-2 algorithm, for simplicity (i.e.,
    // one bit at a time). TODO: optimize to a radix-2^32 algorithm, taking care
    // to get the variable shifts right.
    let quotient = new UInt64(0, 0);
    let remainder = new UInt64(this.lo, this.hi);
    let divisor = new UInt64(_divisor, 0);
    let unit = new UInt64(1, 0);

    // Left-shift the divisor and unit until the high bit of divisor is set.
    while (!divisor.msb()) {
      divisor = divisor.leftShift();
      unit = unit.leftShift();
    }

    // Perform long division one bit at a time.
    while (!unit.zero()) {
      // If divisor < remainder, add unit to quotient and subtract divisor from
      // remainder.
      if (divisor.cmp(remainder) <= 0) {
        quotient = quotient.add(unit);
        remainder = remainder.sub(divisor);
      }
      // Right-shift the divisor and unit.
      divisor = divisor.rightShift();
      unit = unit.rightShift();
    }

    return [quotient, remainder];
  }

  /**
   * Convert a 64-bit number to a string.
   * @override
   */
  toString(): string {
    let result = "";
    let num = this as UInt64;
    while (!num.zero()) {
      const divResult = num.div(10);
      const quotient = divResult[0],
        remainder = divResult[1];
      result = remainder.lo + result;
      num = quotient;
    }
    if (result == "") {
      result = "0";
    }
    return result;
  }

  clone(): UInt64 {
    return new UInt64(this.lo, this.hi);
  }
}

export class Int64 {
  /**
   * Parse a string into a 64-bit number. Returns `null` on a parse error.
   */
  static fromString(s: string): Int64 | null {
    const hasNegative = s.length > 0 && s[0] == "-";
    if (hasNegative) {
      s = s.substring(1);
    }
    let num = UInt64.fromString(s);
    if (num === null) {
      return null;
    }
    if (hasNegative) {
      num = new UInt64(0, 0).sub(num);
    }
    return new Int64(num.lo, num.hi);
  }

  constructor(public lo: number, public hi: number) {}

  add(other: Int64): Int64 {
    const lo = ((this.lo + other.lo) & 0xffffffff) >>> 0;
    const hi =
      (((this.hi + other.hi) & 0xffffffff) >>> 0) +
      (this.lo + other.lo >= 0x100000000 ? 1 : 0);
    return new Int64(lo >>> 0, hi >>> 0);
  }

  sub(other: Int64): Int64 {
    const lo = ((this.lo - other.lo) & 0xffffffff) >>> 0;
    const hi =
      (((this.hi - other.hi) & 0xffffffff) >>> 0) -
      (this.lo - other.lo < 0 ? 1 : 0);
    return new Int64(lo >>> 0, hi >>> 0);
  }

  clone(): Int64 {
    return new Int64(this.lo, this.hi);
  }

  toString(): string {
    // If the number is negative, find its twos-complement inverse.
    var sign = (this.hi & 0x80000000) != 0;
    var num = new UInt64(this.lo, this.hi);
    if (sign) {
      num = new UInt64(0, 0).sub(num);
    }
    return (sign ? "-" : "") + num.toString();
  }
}
