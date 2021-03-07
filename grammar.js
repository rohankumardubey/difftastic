function sep (rule, separator) {
  return optional(sep1(rule, separator));
}

function sep1 (rule, separator) {
  return seq(rule, repeat(seq(separator, rule)));
}

function commaSep1 (rule) {
  return sep1(rule, seq(',', optional(/[\n\r]+/)));
}

function commaSep (rule) {
  return optional(commaSep1(rule));
}

function atleastOnce (rule) {
  return seq(rule, repeat(rule));
}

function binaryOp($, assoc, precedence, operator) {
  return assoc(precedence,
               seq(field('left', $.expr),
                   field('operator', operator),
                   optional($._terminator), field('right', $.expr)));
}

function unaryOp($, assoc, precedence, operator) {
  return assoc(precedence, seq(operator, $.expr));
}

const PREC = {
  COMMENT: -2,
  CALL: -1,
  DOT_CALL: 7,
  ACCESS_CALL: 8,
  CALL_NAME: 6,
  GUARD: 6,
  MAP: 5,
  LIST: 5,
  KW: 4,
  BARE_KW: 1,
};

module.exports = grammar({
  name: 'elixir',

  externals: $ => [
    $._line_break,
    $.heredoc_start,
    $.heredoc_content,
    $.heredoc_end,
    $.sigil_start,
    $.sigil_content,
    $.sigil_end,
  ],

  extras: $ => [
    $.comment,
    /\s|\\\n/
  ],

  conflicts: $ => [
    [$.clause_body],
    [$.cond_body],
    [$.call]
  ],

  word: $ => $.identifier,

  rules: {
    source_file: $ => seq(repeat($.statement), optional($._terminator)),

    statement: $ => seq(
      optional($._terminator), $.expr, $._terminator
    ),

    expr: $ => choice(
      $.module_assign,
      $.binary_op,
      $.unary_op,
      $.case,
      $.cond,
      $.try,
      $.call,
      $.dot_call,
      $.access_call,
      $.anonymous_function,
      $.keyword_list,
      $.sigil,
      $.heredoc,
      $.module_attr,
      $.integer,
      $.float,
      $.module,
      $.atom,
      $.list,
      $.map,
      $.string,
      $.tuple,
      $.literal,
      $.identifier,
    ),

    call: $ => prec(-1, seq(
      field('name', $.identifier),
      choice(
        seq($.expr, optional(seq(',', optional($._terminator), $.bare_keyword_list))),
        seq(optional('.'), $.args),
        $.bare_keyword_list
      ),
      optional($.when),
      optional($.block)
    )),

    module_assign: $ => prec(1, seq(
      $.module_attr,
      choice($.expr, $.bare_keyword_list)
    )),

    binary_op: $ => choice(
      binaryOp($, prec.left, 40, choice('\\\\', '<-')),
      binaryOp($, prec.right, 60, '::'),
      binaryOp($, prec.right, 70, '|'),
      binaryOp($, prec.right, 100, '='),
      binaryOp($, prec.left, 130, choice('||', '|||', 'or')),
      binaryOp($, prec.left, 140, choice('&&', '&&&', 'and')),
      binaryOp($, prec.left, 150, choice('==', '!=', '=~', '===', '!==')),
      binaryOp($, prec.left, 160, choice('<', '>', '<=', '>=')),
      binaryOp($, prec.left, 170, choice('|>', '<<<', '>>>', '<<~', '~>>', '<~', '~>', '<~>', '<|>')),
      binaryOp($, prec.left, 180, choice('in', seq('not', 'in'))),
      binaryOp($, prec.left, 190, choice('^^^')),
      binaryOp($, prec.right, 200, choice('++', '--', '..', '<>', '+++', '---')),
      binaryOp($, prec.left, 210, choice('+', '-')),
      binaryOp($, prec.left, 220, choice('*', '/')),
    ),

    unary_op: $ => choice(
      unaryOp($, prec, 90, '&'),
      unaryOp($, prec, 300, choice('+', '-', '!', '^', '~~~')),
    ),

    dot_call: $ => prec.left(PREC.DOT_CALL, seq(
      field('object', choice($.module, $.identifier, $.atom, $.dot_call)),
      '.',
      choice(
        prec.right(seq(field('function', $.func_name_identifier), optional($.args))),
        $.module
      )
    )),

    access_call: $ => prec.left(PREC.ACCESS_CALL, seq(
      $.expr,
      '[',
      $.expr,
      ']'
    )),

    block: $ => seq(
      'do',
      choice(repeat($.statement),
             optional($._terminator)),
      'end'
    ),

    anonymous_function: $ => seq(
      'fn',
      optional($._terminator),
      atleastOnce(seq(
        choice($.args, optional($.bare_args)),
        '->',
        optional($._terminator),
        prec.right(1, sep1($.expr, $._terminator)))),
      optional($._terminator),
      'end'
    ),

    args: $ => choice(
      seq(
        '(',
        optional(choice(
          seq(commaSep($.expr), optional(seq(',', $.bare_keyword_list))),
          $.bare_keyword_list
        )),
        ')'
      ),
    ),

    bare_args: $ => choice(
      seq(commaSep1($.expr), optional(seq(',', $.bare_keyword_list)), optional($.when)),
    ),

    when: $ => prec.left(PREC.GUARD, seq(
      'when',
      $.expr
    )),

    map: $ => prec.left(PREC.MAP, seq(
      '%{',
      commaSep(choice(
        seq($.expr, '=>', $.expr),
        seq($.keyword, $.expr),
      )),
      '}'
    )),

    list: $ => prec.left(PREC.LIST, seq(
      '[',
      commaSep($.expr),
      ']'
    )),

    keyword_list: $ => prec.left(PREC.KW, seq(
      '[',
      commaSep1(seq($.keyword, $.expr)),
      ']'
    )),

    bare_keyword_list: $ => prec.left(PREC.BARE_KW, commaSep1(seq($.keyword, optional($._terminator), $.expr))),

    tuple: $ => seq(
      '{',
      commaSep(choice($.bare_keyword_list, $.expr)),
      '}'
    ),

    case: $ => seq(
      'case',
      $.expr,
      $._case_block,
    ),

    _case_block: $ => seq(
      'do',
      atleastOnce($.clause),
      optional($._terminator),
      'end'
    ),

    clause: $ => seq(
      optional($._terminator),
      commaSep1($.expr),
      optional($.when),
      '->',
      optional($._terminator),
      $.clause_body,
    ),

    clause_body: $ => seq($.expr, $._terminator, optional($.clause_body)),

    cond: $ => seq(
      'cond',
      $._cond_block,
    ),

    _cond_block: $ => seq(
      'do',
      atleastOnce($.cond_clause),
      optional($._terminator),
      'end'
    ),

    cond_clause: $ => seq(
      optional($._terminator),
      $.expr,
      '->',
      optional($._terminator),
      $.cond_body,
    ),

    cond_body: $ => seq($.expr, $._terminator, optional($.cond_body)),

    try: $ => seq(
      'try',
      'do',
      atleastOnce($.statement),
      optional(seq(
        'rescue',
        atleastOnce($.clause)
      )),
      optional(seq(
        'catch',
        atleastOnce($.clause)
      )),
      optional(seq(
        'else',
        atleastOnce($.clause)
      )),
      optional(seq(
        'after',
        atleastOnce($.statement)
      )),
      'end'
    ),

    heredoc: $ => seq(
      $.heredoc_start,
      repeat(choice(
        $.heredoc_content,
        $.interpolation
      )),
      $.heredoc_end
    ),

    sigil: $ => seq(
      $.sigil_start,
      repeat(choice(
        $.sigil_content,
        $.interpolation
      )),
      $.sigil_end
    ),

    interpolation: $ => seq(
      '#{', optional($.statement), '}'
    ),

    integer: $ => /0[bB][01](_?[01])*|0[oO]?[0-7](_?[0-7])*|(0[dD])?\d(_?\d)*|0[xX][0-9a-fA-F](_?[0-9a-fA-F])*/,
    float: $ => /\d(_?\d)*(\.\d)?(_?\d)*([eE][\+-]?\d(_?\d)*)?/,
    atom: $ => /:[_a-z!.][?!_a-zA-Z0-9]*/,
    module_attr: $ => /@[_a-z][_a-zA-Z0-9]*/,
    keyword: $ => /[_a-z!][?!_a-zA-Z0-9]*:/,
    string: $ => /"[^"]*"/,
    module: $ => /[A-Z][_a-zA-Z0-9]*(\.[A-Z][_a-zA-Z0-9]*)*/,
    identifier: $ => /[_a-z][_a-zA-Z0-9]*[?!]?/,
    func_name_identifier: $ => /[_a-z!][?!_a-zA-Z0-9]*/,
    comment: $ => token(prec(PREC.COMMENT, seq('#', /.*/))),
    _terminator: $ => choice($._line_break, ';'),
    literal: $ => choice('true', 'false', 'nil')
  }
})
