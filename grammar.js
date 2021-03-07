function sep (rule, separator) {
  return optional(sep1(rule, separator));
}

function sep1 (rule, separator) {
  return seq(rule, repeat(seq(separator, rule)));
}

function commaSep1 ($, rule) {
  return prec.left(20, sep1(rule, seq(',', optional($._terminator))));
}

function commaSep($, rule) {
  return optional(commaSep1($, rule));
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

function block_expression($, name) {
  return prec.right(seq(
    name,
    optional($._terminator),
    choice(
      sep($.stab_expr, $._terminator),
      sep($.expr, $._terminator),
    ),
    optional($._terminator),
  ));
}

const PREC = {
  COMMENT: -2,
  CALL: -1,
  DOT_CALL: 7,
  ACCESS_CALL: 8,
  MODULE_ASSIGN: 1,
  CALL_NAME: 6,
  MAP: 5,
  LIST: 5,
  KW: 4,
  BARE_KW: 1,
  ANONYMOUSE_FN: 10,
  BARE_ARGS: 20,
  STAB_EXPR: 15
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
    $.identifier,
    $.keyword,
  ],

  extras: $ => [
    $.comment,
    /\s|\\\n/
  ],

  conflicts: $ => [
    [$.call],
    [$.bare_args],
    [$._clause_body],
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
      $.paren_expr,
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

    paren_expr: $ => seq(
      '(', choice($.stab_expr, $.expr), ')'
    ),

    call: $ => prec(PREC.CALL, seq(
      field('name', $.identifier),
      optional(choice(
        $.bare_args,
        seq(optional('.'), $.args),
        $.bare_keyword_list
      )),
      optional($.block)
    )),

    module_assign: $ => prec(PREC.MODULE_ASSIGN, seq(
      $.module_attr,
      choice($.expr, $.bare_keyword_list)
    )),

    binary_op: $ => choice(
      binaryOp($, prec.left, 40, choice('\\\\', '<-')),
      binaryOp($, prec.right, 50, 'when'),
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
        prec.right(seq(field('function', $.identifier), optional($.args))),
        $.module
      )
    )),

    access_call: $ => prec.left(PREC.ACCESS_CALL, seq(
      $.expr,
      token.immediate('['),
      $.expr,
      ']'
    )),

    after_block: $ => block_expression($, 'after'),
    rescue_block: $ => block_expression($, 'rescue'),
    catch_block: $ => block_expression($, 'catch'),
    else_block: $ => block_expression($, 'else'),

    block: $ => seq(
      block_expression($, 'do'),
      repeat(choice($.after_block, $.rescue_block, $.catch_block, $.else_block)),
      optional($._terminator),
      'end'
    ),

    anonymous_function: $ => prec(PREC.ANONYMOUSE_FN, seq(
      'fn',
      optional($._terminator),
      sep1($.stab_expr, $._terminator),
      optional($._terminator),
      'end'
    )),

    args: $ => prec(1, seq(
      '(',
      optional($._terminator),
      optional(choice(
        seq(commaSep($, $.expr), optional(seq(',', optional($._terminator), $.bare_keyword_list))),
        $.bare_keyword_list
      )),
      optional($._terminator),
      ')'
    )),

    bare_args: $ => seq(commaSep1($, $.expr), optional(seq(',', optional($._terminator), $.bare_keyword_list))),

    map: $ => prec.left(PREC.MAP, seq(
      '%{',
      optional($._terminator),
      commaSep($, choice(
        seq($.expr, '=>', $.expr),
        seq($.keyword, $.expr),
      )),
      '}'
    )),

    list: $ => prec.left(PREC.LIST, seq(
      '[',
      optional($._terminator),
      commaSep($, $.expr),
      ']'
    )),

    keyword_list: $ => prec.left(PREC.KW, seq(
      '[',
      optional($._terminator),
      commaSep1($, seq($.keyword, $.expr)),
      ']'
    )),

    bare_keyword_list: $ => prec.left(PREC.BARE_KW, commaSep1($, seq($.keyword, optional($._terminator), $.expr))),

    tuple: $ => seq(
      '{',
      commaSep($, choice($.bare_keyword_list, $.expr)),
      '}'
    ),

    stab_expr: $ => prec.right(PREC.STAB_EXPR,
                               seq(
                                 optional(choice($.args, $.bare_args)),
                                 '->',
                                 optional($._terminator),
                                 $._clause_body
                               )
                              ),

    _clause_body: $ => seq($.expr, optional(seq($._terminator, $._clause_body))),

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
    string: $ => /"[^"]*"/,
    module: $ => /[A-Z][_a-zA-Z0-9]*(\.[A-Z][_a-zA-Z0-9]*)*/,
    comment: $ => token(prec(PREC.COMMENT, seq('#', /.*/))),
    _terminator: $ => prec.right(atleastOnce(choice($._line_break, ';'))),
    literal: $ => choice('true', 'false', 'nil')
  }
})
